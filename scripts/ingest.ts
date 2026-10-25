/**
 * Registry-driven ingestion into Octo.
 *
 * - noise / crashes: incremental append of new events into the existing
 *   public.nyc_311_noise / public.nyc_crashes tables (insert-only, ON CONFLICT DO NOTHING).
 * - grid sources: Socrata rolls rows up to the block grid per month (windowed)
 *   or once (inventories); we replace the affected months in raw.source_cells.
 * - geometry sources: rows are paged and reduced to one point each (same
 *   reduction the browser uses), then counted per block.
 * Events are capped at ~12 months (INGEST_MONTHS). Afterwards the marts refresh.
 *
 *   pnpm ingest                 all sources
 *   pnpm ingest noise trees     only these ids
 */
import { BLOCK_GRID_DEG } from "../src/lib/geo/blocks";
import { representativePoint } from "../src/lib/datasets/fetchSource";
import { SOURCES, type GeometrySource, type GridSource, type SourceConfig } from "../src/lib/datasets/registry";
import { octoQuery } from "../api/_lib/octo";
import { collectEvents, upsertEvents } from "../server/features/events/ingest";
import { collectPlaceToilets, replacePlaceToilets } from "../server/features/place-toilets/ingest";
import { collectOsmToilets, replaceOsmToilets } from "../server/features/restrooms/osm";
import { loadEnv } from "./env";

const SOCRATA = "https://data.cityofnewyork.us/resource";
const PAGE = 50_000;
const BATCH = 5_000;

function socrataHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const { SOCRATA_KEY_ID: id, SOCRATA_KEY_SECRET: secret, SOCRATA_APP_TOKEN: token } = process.env;
  if (id && secret) h.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  if (token) h["x-app-token"] = token;
  return h;
}

async function soql<T>(dataset: string, params: Record<string, string>): Promise<T[]> {
  const url = `${SOCRATA}/${dataset}.json?${new URLSearchParams(params)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: socrataHeaders() });
    if (res.ok) return (await res.json()) as T[];
    if (attempt >= 3 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`Socrata ${dataset} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

async function soqlAll<T>(dataset: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await soql<T>(dataset, { ...params, $limit: String(PAGE), $offset: String(offset) });
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Inserts rows with one jsonb parameter per batch (no per-value params, no string SQL). */
async function insertJson(table: string, columns: Record<string, string>, rows: object[], conflict = ""): Promise<void> {
  const names = Object.keys(columns);
  const defs = names.map((n) => `${n} ${columns[n]}`).join(", ");
  for (let i = 0; i < rows.length; i += BATCH) {
    await octoQuery(
      `INSERT INTO ${table} (${names.join(", ")}) SELECT ${names.join(", ")} FROM jsonb_to_recordset($1::jsonb) AS x(${defs}) ${conflict}`,
      [JSON.stringify(rows.slice(i, i + BATCH))],
    );
  }
}

const MONTHS = Number(process.env.INGEST_MONTHS ?? 12);
function since(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - MONTHS);
  return `${d.toISOString().slice(0, 7)}-01T00:00:00`;
}

async function maxTs(sql: string): Promise<string> {
  const { rows } = await octoQuery<{ m: string | null }>(sql);
  const m = rows[0]?.m;
  return m ? m.replace("Z", "").replace(/\.\d+$/, "") : since();
}

type Row = Record<string, string | undefined>;
const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

async function ingestNoise(): Promise<number> {
  const from = await maxTs(`SELECT to_char(max(created_date), 'YYYY-MM-DD"T"HH24:MI:SS') AS m FROM public.nyc_311_noise`);
  const rows = await soqlAll<Row>("erm2-nwe9", {
    $select:
      "unique_key,created_date,closed_date,complaint_type,descriptor,location_type,incident_address,street_name,incident_zip,borough,community_board,agency,status,latitude,longitude",
    $where: `created_date > '${from}' AND starts_with(complaint_type, 'Noise')`,
    $order: "created_date",
  });
  await insertJson(
    "public.nyc_311_noise",
    {
      unique_key: "bigint", created_date: "timestamp", closed_date: "timestamp", complaint_type: "text",
      descriptor: "text", location_type: "text", incident_address: "text", street_name: "text",
      incident_zip: "text", borough: "text", community_board: "text", agency: "text", status: "text",
      latitude: "double precision", longitude: "double precision",
    },
    rows.map((r) => ({ ...r, latitude: num(r.latitude), longitude: num(r.longitude) })),
    "ON CONFLICT (unique_key) DO NOTHING",
  );
  return rows.length;
}

async function ingestCrashes(): Promise<number> {
  const from = await maxTs(`SELECT to_char(max(crash_date), 'YYYY-MM-DD"T"HH24:MI:SS') AS m FROM public.nyc_crashes`);
  const rows = await soqlAll<Row>("h9gi-nx95", {
    $where: `crash_date > '${from}'`,
    $order: "crash_date",
  });
  const ints = [
    "number_of_persons_injured", "number_of_persons_killed", "number_of_pedestrians_injured",
    "number_of_pedestrians_killed", "number_of_cyclist_injured", "number_of_cyclist_killed",
    "number_of_motorist_injured", "number_of_motorist_killed",
  ];
  const cols: Record<string, string> = {
    collision_id: "bigint", crash_date: "timestamp", crash_hour: "integer", borough: "text", zip_code: "text",
    on_street_name: "text", cross_street_name: "text", latitude: "double precision", longitude: "double precision",
    contributing_factor_vehicle_1: "text", vehicle_type_code1: "text",
  };
  for (const k of ints) cols[k] = "integer";
  await insertJson(
    "public.nyc_crashes",
    cols,
    rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      out.crash_hour = r.crash_time ? Number(r.crash_time.split(":")[0]) : null;
      out.latitude = num(r.latitude);
      out.longitude = num(r.longitude);
      for (const k of ints) out[k] = num(r[k]);
      return out;
    }),
    "ON CONFLICT (collision_id) DO NOTHING",
  );
  return rows.length;
}

interface Cell { month: string | null; r: number; c: number; category: string; n: number }

/** Month starts from the cap up to the current month, as YYYY-MM-01. */
export function monthStarts(from: string, now = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  while (d.getTime() <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

async function gridCells(s: GridSource): Promise<Cell[]> {
  const col = (c: string) => (s.castNumber ? `${c}::number` : c);
  const measure = s.measure ?? "count";
  const value = measure === "count" ? "count(*)" : `sum(${measure.slice(4)}::number)`;
  const base = [`${s.lat} IS NOT NULL`, `${s.lon} IS NOT NULL`];
  if (s.where) base.push(s.where);
  const select = `floor(${col(s.lat)} / ${BLOCK_GRID_DEG}) AS r, floor(${col(s.lon)} / ${BLOCK_GRID_DEG}) AS c, ${value} AS n`;
  const toCells = (rows: Row[], month: string | null): Cell[] =>
    rows
      .map((r) => ({ month, r: Number(r.r), c: Number(r.c), category: "", n: Number(r.n ?? 0) }))
      .filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c) && x.n > 0);
  if (!s.dateField) {
    return toCells(await soqlAll<Row>(s.datasetId, { $select: select, $where: base.join(" AND "), $group: "r, c", $order: "r, c" }), null);
  }
  // One request per month: a 12-month GROUP BY re-aggregates on every page and times out.
  const months = monthStarts(since());
  const cells: Cell[] = [];
  for (let i = 0; i < months.length; i++) {
    const next = months[i + 1];
    const where = [...base, `${s.dateField} >= '${months[i]}T00:00:00'`];
    if (next) where.push(`${s.dateField} < '${next}T00:00:00'`);
    const rows = await soqlAll<Row>(s.datasetId, { $select: select, $where: where.join(" AND "), $group: "r, c", $order: "r, c" });
    cells.push(...toCells(rows, months[i]));
  }
  return cells;
}

async function geometryCells(s: GeometrySource): Promise<Cell[]> {
  const where = [`${s.geom} IS NOT NULL`];
  if (s.dateField) where.push(`${s.dateField} >= '${since()}'`);
  if (s.where) where.push(s.where);
  const rows = (await soqlAll<Record<string, unknown>>(s.datasetId, {
    $select: s.geom, $where: where.join(" AND "), $order: ":id",
  })).slice(0, s.maxRows);
  const cells = new Map<string, Cell>();
  for (const row of rows) {
    const p = representativePoint(row[s.geom]);
    if (!p) continue;
    const r = Math.floor(p[1] / BLOCK_GRID_DEG);
    const c = Math.floor(p[0] / BLOCK_GRID_DEG);
    const key = `${r}:${c}`;
    const cell = cells.get(key) ?? { month: null, r, c, category: "", n: 0 };
    cell.n += 1;
    cells.set(key, cell);
  }
  return [...cells.values()];
}

async function ingestCells(s: GridSource | GeometrySource): Promise<number> {
  const cells = s.kind === "grid" ? await gridCells(s) : await geometryCells(s);
  // Replace this source's slice: the whole source for inventories, the window for event sources.
  await octoQuery(
    s.dateField
      ? "DELETE FROM raw.source_cells WHERE source_id = $1 AND month >= $2::date"
      : "DELETE FROM raw.source_cells WHERE source_id = $1",
    s.dateField ? [s.id, since().slice(0, 10)] : [s.id],
  );
  await insertJson(
    "raw.source_cells",
    { source_id: "text", month: "date", r: "integer", c: "integer", category: "text", n: "double precision" },
    cells.map((c) => ({ ...c, source_id: s.id })),
  );
  return cells.length;
}

async function syncSources(): Promise<void> {
  await insertJson(
    "core.sources",
    {
      id: "text", label: "text", short_label: "text", category: "text", dataset_id: "text", kind: "text",
      unit: "text", polarity: "text", windowed: "boolean", description: "text", guide: "jsonb", filters: "jsonb",
    },
    SOURCES.map((s) => ({
      id: s.id, label: s.label, short_label: s.shortLabel, category: s.category, dataset_id: s.datasetId,
      kind: s.kind, unit: s.unit, polarity: s.polarity, description: s.description, guide: s.guide,
      filters: s.filters ?? {}, windowed: s.kind === "builtin" || Boolean(s.dateField),
    })),
    `ON CONFLICT (id) DO UPDATE SET label = excluded.label, short_label = excluded.short_label,
      category = excluded.category, dataset_id = excluded.dataset_id, kind = excluded.kind, unit = excluded.unit,
      polarity = excluded.polarity, windowed = excluded.windowed, description = excluded.description,
      guide = excluded.guide, filters = excluded.filters, updated_at = now()`,
  );
}

async function ingest(s: SourceConfig): Promise<number> {
  if (s.kind === "builtin") return s.builtin === "noise" ? ingestNoise() : ingestCrashes();
  return ingestCells(s);
}

/** Public restrooms (i7jb-7jku): a small inventory, replaced whole into raw.restrooms. */
async function ingestRestrooms(): Promise<number> {
  // :updated_at is the row's last change at NYC Open Data, served as the record's asOf.
  const rows = await soqlAll<Row>("i7jb-7jku", { $select: "*, :updated_at", $where: "latitude IS NOT NULL", $order: "facility_name" });
  const byName = new Map(rows.filter((r) => r.facility_name).map((r) => [r.facility_name, r]));
  await octoQuery("DELETE FROM raw.restrooms");
  await insertJson(
    "raw.restrooms",
    { facility_name: "text", row: "jsonb" },
    [...byName.values()].map((r) => {
      const { location_1: _geom, ...rest } = r;
      return { facility_name: r.facility_name, row: rest };
    }),
  );
  return byName.size;
}

async function main() {
  loadEnv();
  const only = process.argv.slice(2);
  await syncSources();
  let failed = 0;
  for (const s of SOURCES.filter((x) => !only.length || only.includes(x.id))) {
    const t0 = Date.now();
    const started = new Date().toISOString();
    try {
      const n = await ingest(s);
      const ms = Date.now() - t0;
      console.log(`${s.id}: ${n} rows (${ms} ms)`);
      await octoQuery(
        "INSERT INTO core.ingest_runs (source_id, started_at, finished_at, rows, status) VALUES ($1, $2, now(), $3, 'ok')",
        [s.id, started, n],
      );
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${s.id}: FAILED ${msg}`);
      await octoQuery(
        "INSERT INTO core.ingest_runs (source_id, started_at, finished_at, status, detail) VALUES ($1, $2, now(), 'error', $3)",
        [s.id, started, msg.slice(0, 1000)],
      );
    }
  }
  if (!only.length || only.includes("restrooms")) {
    const started = new Date().toISOString();
    try {
      const n = await ingestRestrooms();
      console.log(`restrooms: ${n} rows`);
      await octoQuery(
        "INSERT INTO core.ingest_runs (source_id, started_at, finished_at, rows, status) VALUES ('restrooms', $1, now(), $2, 'ok')",
        [started, n],
      );
    } catch (err) {
      failed++;
      console.error(`restrooms: FAILED ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!only.length || only.includes("events")) {
    const started = new Date().toISOString();
    try {
      const getJson = async (url: string): Promise<unknown> => {
        for (let attempt = 0; ; attempt++) {
          const res = await fetch(url, { headers: url.startsWith(SOCRATA) ? socrataHeaders() : {} });
          if (res.ok) return res.json();
          if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`${new URL(url).host} ${res.status}`);
          await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        }
      };
      const { events, stats } = await collectEvents(getJson);
      await upsertEvents(events, (sql, params) => octoQuery(sql, params));
      console.log(`events: ${stats.kept} kept (${stats.permitted} permitted rows, ${stats.parks} Parks rows, ${stats.noLocation} without a location)`);
      await octoQuery(
        "INSERT INTO core.ingest_runs (source_id, started_at, finished_at, rows, status) VALUES ('events', $1, now(), $2, 'ok')",
        [started, stats.kept],
      );
    } catch (err) {
      failed++;
      console.error(`events: FAILED ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!only.length || only.includes("place-toilets")) {
    const started = new Date().toISOString();
    try {
      const post = async (url: string, body: URLSearchParams): Promise<unknown> => {
        for (let attempt = 0; ; attempt++) {
          const res = await fetch(url, { method: "POST", body, headers: { "User-Agent": "nyc-map-agent nightly ingest (nyc.design-bakery.com)" } });
          if (res.ok) return res.json();
          if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`${new URL(url).host} ${res.status}`);
          await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt));
        }
      };
      const { places, elements } = await collectPlaceToilets(post);
      await replacePlaceToilets(places, (sql, params) => octoQuery(sql, params));
      const anyone = places.filter((p) => p.access === "anyone").length;
      console.log(`place-toilets: ${places.length} kept of ${elements} OSM elements (${anyone} anyone, ${places.length - anyone} customers only)`);
      await octoQuery(
        "INSERT INTO core.ingest_runs (source_id, started_at, finished_at, rows, status) VALUES ('place-toilets', $1, now(), $2, 'ok')",
        [started, places.length],
      );
    } catch (err) {
      failed++;
      console.error(`place-toilets: FAILED ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!only.length || only.includes("osm-toilets")) {
    const started = new Date().toISOString();
    try {
      const post = async (url: string, body: URLSearchParams): Promise<unknown> => {
        for (let attempt = 0; ; attempt++) {
          const res = await fetch(url, { method: "POST", body, headers: { "User-Agent": "nyc-map-agent nightly ingest (nyc.design-bakery.com)" } });
          if (res.ok) return res.json();
          if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`${new URL(url).host} ${res.status}`);
          await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt));
        }
      };
      const { toilets, elements } = await collectOsmToilets(post);
      await replaceOsmToilets(toilets, (sql, params) => octoQuery(sql, params));
      console.log(`osm-toilets: ${toilets.length} kept of ${elements} OSM amenity=toilets (private, no and customers-only dropped)`);
      await octoQuery(
        "INSERT INTO core.ingest_runs (source_id, started_at, finished_at, rows, status) VALUES ('osm-toilets', $1, now(), $2, 'ok')",
        [started, toilets.length],
      );
    } catch (err) {
      failed++;
      console.error(`osm-toilets: FAILED ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
