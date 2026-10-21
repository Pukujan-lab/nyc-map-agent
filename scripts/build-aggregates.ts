/**
 * Precomputes the browser's noise / crash rollups from Octo raw tables and
 * stores them in marts.aggregates, so the octo backend serves them from
 * /api/aggregate instead of the browser paging ~200k Socrata rows at startup.
 * Same code as the browser worker (src/lib/geo/aggregateCore.ts), different rows.
 *
 *   pnpm build:aggregates      (after ingest + load:areas)
 */
import { octoQuery } from "../api/_lib/octo";
import { parseNtaBoundaries } from "../src/lib/api/nta";
import { NOISE_FIELDS } from "../src/lib/api/noise";
import { CRASH_FIELDS } from "../src/lib/api/crashes";
import { aggregateRows, type RowSource } from "../src/lib/geo/aggregateCore";
import { windowBounds, WINDOW_IDS, type WindowId } from "../src/lib/windows";
import type { AggregateWorkerRequest, DatasetId } from "../src/lib/geo/types";
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

function octoRows(dataset: DatasetId, start: string, end: string): RowSource {
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
      return { header, rows: rows.map((r) => header.map((h) => r[h] ?? "")) };
    },
  };
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
  for (const [dataset, windowId] of JOBS) {
    const t0 = Date.now();
    const bounds = windowBounds(windowId);
    const request: AggregateWorkerRequest = { dataset, windowId, windowStart: bounds.startIso, windowEnd: bounds.endIso, boundaries };
    const result = await aggregateRows(request, octoRows(dataset, bounds.startIso, bounds.endIso));
    result.sources = [{ label: `${dataset === "noise" ? "311 noise" : "Crash"} rows (Octo ${dataset === "noise" ? "raw.noise_311" : "raw.crashes"}) → neighborhood rollup`, query: "/api/aggregate" }];
    const body = JSON.stringify(result);
    await octoQuery(
      `INSERT INTO marts.aggregates (dataset, window_id, result, generated_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (dataset, window_id) DO UPDATE SET result = excluded.result, generated_at = now()`,
      [dataset, windowId, body],
    );
    console.log(`${dataset} ${windowId}: ${result.totalRows} rows, ${result.blocks.length} blocks, ${(body.length / 1e6).toFixed(2)} MB (${Date.now() - t0} ms)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
