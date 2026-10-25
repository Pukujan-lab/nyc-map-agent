/**
 * Precomputes the browser's noise / crash rollups from Octo raw tables and
 * stores them in marts.aggregates, so the octo backend serves them from
 * /api/aggregate instead of the browser paging ~200k Socrata rows at startup.
 * Same code as the browser worker (src/lib/geo/aggregateCore.ts), different rows.
 *
 * The block cells are real tax blocks: the window's points are spatially
 * joined to the published nyc-blocks.geojson in DuckDB (scripts/block-join.ts),
 * and the per-block totals also land in marts.block_stats. The registry
 * sources' fine-grid cells get the same join into marts.taxblock_month (#120).
 *
 *   pnpm build:aggregates      (after ingest + load:areas + publish:block-tiles)
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blockJoin, type BlockJoin, type BlockPoint, type TaxPoint } from "./block-join";
import { octoQuery } from "../api/_lib/octo";
import { parseNtaBoundaries } from "../src/lib/api/nta";
import { NOISE_FIELDS } from "../src/lib/api/noise";
import { CRASH_FIELDS } from "../src/lib/api/crashes";
import { aggregateRows, type RowSource } from "../src/lib/geo/aggregateCore";
import { windowBounds, WINDOW_IDS, type WindowId } from "../src/lib/windows";
import type { AggregateResult, AggregateWorkerRequest, DatasetId } from "../src/lib/geo/types";
import { FINE_GRID_DEG } from "../src/lib/geo/blocks";
import { loadEnv } from "./env";

/** Crashes always use 12 months (see CRASH_WINDOW in src/lib/geo/aggregate.ts). */
const JOBS: Array<[DatasetId, WindowId]> = [...WINDOW_IDS.map((w): [DatasetId, WindowId] => ["noise", w]), ["crashes", "12mo"]];

/** Octo columns renamed / formatted to the Socrata CSV the aggregator parses. */
const SELECT: Record<DatasetId, string> = {
  noise: `latitude::text AS latitude, longitude::text AS longitude, complaint_type, coalesce(descriptor, '') AS descriptor,
          to_char(created_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS created_date, coalesce(incident_address, '') AS incident_address`,
  crashes: `latitude::text AS latitude, longitude::text AS longitude,
          to_char(crash_date, 'YYYY-MM-DD"T"00:00:00.000') AS crash_date, lpad(coalesce(crash_hour, 0)::text, 2, '0') || ':00' AS crash_time,
          coalesce(on_street_name, '') AS on_street_name, coalesce(cross_street_name, '') AS cross_street_name,
          coalesce(number_of_persons_injured, 0)::text AS number_of_persons_injured, coalesce(number_of_persons_killed, 0)::text AS number_of_persons_killed,
          coalesce(number_of_cyclist_injured, 0)::text AS number_of_cyclist_injured, coalesce(number_of_pedestrians_injured, 0)::text AS number_of_pedestrians_injured,
          coalesce(contributing_factor_vehicle_1, '') AS contributing_factor_vehicle_1`,
};

function octoRows(dataset: DatasetId, start: string, end: string, sink: BlockPoint[]): RowSource {
  const table = dataset === "noise" ? "raw.noise_311" : "raw.crashes";
  const ts = dataset === "noise" ? "created_date" : "crash_date";
  const key = dataset === "noise" ? "unique_key" : "collision_id";
  const where = `${ts} > $1::timestamp AND ${ts} < $2::timestamp AND latitude IS NOT NULL AND longitude IS NOT NULL` +
    (dataset === "noise" ? " AND complaint_type LIKE 'Noise%'" : "");
  const header = [...(dataset === "noise" ? NOISE_FIELDS : CRASH_FIELDS)];
  return {
    pageSize: 10_000,
    count: async () => Number((await octoQuery<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, [start, end])).rows[0].n),
    page: async (offset, limit) => {
      const { rows } = await octoQuery<Record<string, string>>(
        `SELECT ${SELECT[dataset]} FROM ${table} WHERE ${where} ORDER BY ${key} LIMIT ${limit} OFFSET ${offset}`,
        [start, end],
        { rowLimit: limit },
      );
      for (const r of rows) sink.push(toPoint(dataset, r));
      return { header, rows: rows.map((r) => header.map((h) => r[h] ?? "")) };
    },
  };
}

function toPoint(dataset: DatasetId, r: Record<string, string>): BlockPoint {
  const noise = dataset === "noise";
  return {
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    hour: Number((noise ? r.created_date?.slice(11, 13) : r.crash_time?.slice(0, 2)) ?? 0) || 0,
    // Same normalisation as aggregateCore's addresses / streets.
    place: noise
      ? (r.incident_address ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 48)
      : (r.on_street_name ?? "").trim(),
    injured: Number(r.number_of_persons_injured ?? 0) || 0,
    killed: Number(r.number_of_persons_killed ?? 0) || 0,
    cyclists: Number(r.number_of_cyclist_injured ?? 0) || 0,
  };
}

/** nyc-blocks.geojson: BLOCKS_GEOJSON if set, else the copy published through Octo files. */
async function blocksFile(dir: string): Promise<string> {
  if (process.env.BLOCKS_GEOJSON) return process.env.BLOCKS_GEOJSON;
  const { rows } = await octoQuery<{ parts: unknown }>("SELECT parts FROM core.published_assets WHERE name = 'nyc-blocks.geojson'");
  if (!rows[0]) throw new Error("nyc-blocks.geojson is not published: run pnpm build:block-tiles && pnpm publish:block-tiles.");
  const parts = (typeof rows[0].parts === "string" ? JSON.parse(rows[0].parts) : rows[0].parts) as Array<{ url: string }>;
  const chunks = await Promise.all(parts.map(async (p) => {
    const res = await fetch(p.url);
    if (!res.ok) throw new Error(`blocks download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }));
  const file = join(dir, "nyc-blocks.geojson");
  writeFileSync(file, Buffer.concat(chunks));
  return file;
}

async function writeBlockStats(dataset: DatasetId, windowId: WindowId, cells: AggregateResult["blocks"]) {
  await octoQuery("DELETE FROM marts.block_stats WHERE dataset = $1 AND window_id = $2", [dataset, windowId]);
  for (let i = 0; i < cells.length; i += 2000) {
    const batch = cells.slice(i, i + 2000).map((c) => ({
      block_id: Number(c.key), label: c.label ?? "", nta2020: c.ntaCode || null, n: c.count, night: c.nightCount,
      injured: c.injured, killed: c.killed, cyclists: c.cyclists, area_m2: c.areaM2 ?? null,
    }));
    await octoQuery(
      `INSERT INTO marts.block_stats (dataset, window_id, block_id, boro, block, label, nta2020, n, night, injured, killed, cyclists, area_m2)
       SELECT $1, $2, x.block_id, x.block_id / 100000, x.block_id % 100000, x.label, x.nta2020, x.n, x.night, x.injured, x.killed, x.cyclists, x.area_m2
       FROM jsonb_to_recordset($3::jsonb) AS x(block_id int, label text, nta2020 text, n numeric, night numeric, injured numeric, killed numeric, cyclists numeric, area_m2 int)`,
      [dataset, windowId, JSON.stringify(batch)],
    );
  }
}

const TAX_PAGE = 50_000;

/** raw.source_fine_cells, one source at a time, joined to tax blocks into marts.taxblock_month. */
async function buildTaxBlocks(blocks: BlockJoin) {
  const { rows: sources } = await octoQuery<{ source_id: string }>("SELECT DISTINCT source_id FROM raw.source_fine_cells");
  for (const { source_id: source } of sources) {
    const t0 = Date.now();
    const points: TaxPoint[] = [];
    for (let offset = 0; ; offset += TAX_PAGE) {
      const { rows } = await octoQuery<{ fr: number; fc: number; month: string | null; category: string; n: number }>(
        `SELECT fr, fc, to_char(month, 'YYYY-MM-DD') AS month, category, n::float8 AS n
         FROM raw.source_fine_cells WHERE source_id = $1 ORDER BY month NULLS FIRST, fr, fc, category LIMIT ${TAX_PAGE} OFFSET ${offset}`,
        [source],
        { rowLimit: TAX_PAGE },
      );
      // The cell's centre stands for its records.
      for (const r of rows) {
        points.push({ lat: (Number(r.fr) + 0.5) * FINE_GRID_DEG, lon: (Number(r.fc) + 0.5) * FINE_GRID_DEG, month: r.month, category: r.category, n: Number(r.n) });
      }
      if (rows.length < TAX_PAGE) break;
    }
    const counts = await blocks.count(source, points);
    await octoQuery("DELETE FROM marts.taxblock_month WHERE source_id = $1", [source]);
    for (let i = 0; i < counts.length; i += 2000) {
      const batch = counts.slice(i, i + 2000).map((c) => ({
        month: c.month, block_id: c.blockId, nta2020: c.nta2020, lon: c.lon, lat: c.lat, category: c.category, n: c.n,
      }));
      await octoQuery(
        `INSERT INTO marts.taxblock_month (source_id, month, block_id, nta2020, lon, lat, category, n)
         SELECT $1, x.month::date, x.block_id, x.nta2020, x.lon, x.lat, x.category, x.n
         FROM jsonb_to_recordset($2::jsonb) AS x(month text, block_id int, nta2020 text, lon float8, lat float8, category text, n float8)`,
        [source, JSON.stringify(batch)],
      );
    }
    console.log(`${source}: ${points.length} fine cells, ${counts.length} block rows (${Date.now() - t0} ms)`);
  }
}

async function main() {
  loadEnv();
  const shapes = await octoQuery<{ area: string; name: string; borough: string; geometry: unknown }>(
    "SELECT area, name, borough, geometry FROM core.area_shapes WHERE level = 'nta'", [], { rowLimit: 1000 },
  );
  const boundaries = parseNtaBoundaries({
    type: "FeatureCollection",
    features: shapes.rows.map((r) => ({
      type: "Feature",
      properties: { nta2020: r.area, ntaname: r.name, boroname: r.borough },
      geometry: typeof r.geometry === "string" ? JSON.parse(r.geometry) : r.geometry,
    })),
  });
  if (boundaries.length === 0) throw new Error("core.area_shapes is empty: run pnpm load:areas first.");
  const dir = mkdtempSync(join(tmpdir(), "aggregates-"));
  const ntaFile = join(dir, "nta.geojson");
  writeFileSync(ntaFile, JSON.stringify({
    type: "FeatureCollection",
    features: shapes.rows.map((r) => ({
      type: "Feature",
      properties: { nta2020: r.area },
      geometry: typeof r.geometry === "string" ? JSON.parse(r.geometry) : r.geometry,
    })),
  }));
  const blocks = await blockJoin(await blocksFile(dir), ntaFile);
  for (const [dataset, windowId] of JOBS) {
    const t0 = Date.now();
    const bounds = windowBounds(windowId);
    const request: AggregateWorkerRequest = { dataset, windowId, windowStart: bounds.startIso, windowEnd: bounds.endIso, boundaries };
    const points: BlockPoint[] = [];
    const result = await aggregateRows(request, octoRows(dataset, bounds.startIso, bounds.endIso, points));
    // Real tax blocks replace the browser's ~300 m grid squares.
    result.blocks = await blocks.join(dataset, points);
    await writeBlockStats(dataset, windowId, result.blocks);
    result.sources = [{ label: `${dataset === "noise" ? "311 noise" : "Crash"} rows (Octo ${dataset === "noise" ? "raw.noise_311" : "raw.crashes"}) → neighborhood rollup`, query: "/api/aggregate" }];
    const body = JSON.stringify(result);
    await octoQuery(
      `INSERT INTO marts.aggregates (dataset, window_id, result, generated_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (dataset, window_id) DO UPDATE SET result = excluded.result, generated_at = now()`,
      [dataset, windowId, body],
    );
    console.log(`${dataset} ${windowId}: ${result.totalRows} rows, ${result.blocks.length} blocks, ${(body.length / 1e6).toFixed(2)} MB (${Date.now() - t0} ms)`);
  }
  await buildTaxBlocks(blocks);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
