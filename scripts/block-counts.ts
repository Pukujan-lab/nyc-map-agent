/**
 * Block-keyed counts for registry sources (#120): per month, Socrata rolls the
 * source's points up to ~11 m cells, DuckDB places each cell in a real tax block
 * (scripts/block-join.ts), and the totals land in raw.source_block_cells with
 * the block facts in core.tax_blocks. /api/blocks reads both at level=block.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { octoQuery } from "../api/_lib/octo";
import { cellCenter, POINT_CELL_SCALE } from "../src/lib/datasets/blockKeyed";
import type { GridSource } from "../src/lib/datasets/registry";
import { blockJoin, publishedBlocksFile, type TaxBlock, type WeightedPoint } from "./block-join";

export type Row = Record<string, string | undefined>;
/** Paged Socrata query (scripts/ingest.ts supplies it). */
export type SoqlAll = (dataset: string, params: Record<string, string>) => Promise<Row[]>;

export interface BlockCountRow {
  source_id: string;
  month: string | null;
  block_id: number;
  n: number;
}

/** SoQL select for the ~11 m cells of a grid source (lat/lon columns come from the registry). */
export function fineCellSelect(s: Pick<GridSource, "lat" | "lon" | "castNumber">): string {
  const col = (c: string) => (s.castNumber ? `${c}::number` : c);
  return `floor(${col(s.lat)} * ${POINT_CELL_SCALE}) AS r, floor(${col(s.lon)} * ${POINT_CELL_SCALE}) AS c, count(*) AS n`;
}

/** Socrata rows to weighted points at the cell centres; non-finite or empty cells are dropped. */
export function rowsToPoints(rows: Row[]): WeightedPoint[] {
  const out: WeightedPoint[] = [];
  for (const row of rows) {
    const r = Number(row.r);
    const c = Number(row.c);
    const n = Number(row.n ?? 0);
    if (!Number.isFinite(r) || !Number.isFinite(c) || !(n > 0)) continue;
    out.push({ lat: cellCenter(r), lon: cellCenter(c), n });
  }
  return out;
}

/** Per-block totals for one month (null for an inventory) as insertable rows, largest first. */
export function toBlockCountRows(sourceId: string, month: string | null, counts: Map<number, number>): BlockCountRow[] {
  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([block_id, n]) => ({ source_id: sourceId, month, block_id, n }));
}

/** Block facts as core.tax_blocks rows (block_id = boro * 100000 + block). */
export function toTaxBlockRows(blocks: TaxBlock[]): object[] {
  return blocks.map((b) => ({
    block_id: b.id,
    boro: Math.floor(b.id / 100000),
    block: b.id % 100000,
    label: b.label,
    nta2020: b.nta2020 || null,
    west: b.west,
    south: b.south,
    east: b.east,
    north: b.north,
    area_m2: b.areaM2,
  }));
}

async function insertJson(table: string, columns: Record<string, string>, rows: object[], conflict = ""): Promise<void> {
  const names = Object.keys(columns);
  const defs = names.map((n) => `${n} ${columns[n]}`).join(", ");
  for (let i = 0; i < rows.length; i += 5000) {
    await octoQuery(
      `INSERT INTO ${table} (${names.join(", ")}) SELECT ${names.join(", ")} FROM jsonb_to_recordset($1::jsonb) AS x(${defs}) ${conflict}`,
      [JSON.stringify(rows.slice(i, i + 5000))],
    );
  }
}

async function ntaFile(dir: string): Promise<string> {
  const shapes = await octoQuery<{ area: string; geometry: unknown }>(
    "SELECT area, geometry FROM core.area_shapes WHERE level = 'nta'",
    [],
    { rowLimit: 1000 },
  );
  if (shapes.rows.length === 0) throw new Error("core.area_shapes is empty: run pnpm load:areas first.");
  const file = join(dir, "nta.geojson");
  writeFileSync(
    file,
    JSON.stringify({
      type: "FeatureCollection",
      features: shapes.rows.map((r) => ({
        type: "Feature",
        properties: { nta2020: r.area },
        geometry: typeof r.geometry === "string" ? (JSON.parse(r.geometry) as unknown) : r.geometry,
      })),
    }),
  );
  return file;
}

export interface BlockCountDeps {
  soqlAll: SoqlAll;
  /** Month starts (YYYY-MM-01) of the window, oldest first. */
  months: string[];
  /** Window start for the delete (YYYY-MM-DD). */
  windowStart: string;
}

/** Rebuilds the source's block counts for the window. Returns the number of block-month rows written. */
export async function ingestBlockCounts(s: GridSource, deps: BlockCountDeps): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "block-counts-"));
  const joiner = await blockJoin(await publishedBlocksFile(dir), await ntaFile(dir));
  const base = [`${s.lat} IS NOT NULL`, `${s.lon} IS NOT NULL`];
  if (s.where) base.push(s.where);
  const select = fineCellSelect(s);
  const rows: BlockCountRow[] = [];
  const slices: Array<string | null> = s.dateField ? deps.months : [null];
  for (let i = 0; i < slices.length; i++) {
    const where = [...base];
    const month = slices[i] ?? null;
    if (month && s.dateField) {
      where.push(`${s.dateField} >= '${month}T00:00:00'`);
      const next = slices[i + 1];
      if (next) where.push(`${s.dateField} < '${next}T00:00:00'`);
    }
    const cells = await deps.soqlAll(s.datasetId, { $select: select, $where: where.join(" AND "), $group: "r, c", $order: "r, c" });
    rows.push(...toBlockCountRows(s.id, month, await joiner.count(rowsToPoints(cells))));
  }
  await insertJson(
    "core.tax_blocks",
    {
      block_id: "integer", boro: "smallint", block: "integer", label: "text", nta2020: "text",
      west: "double precision", south: "double precision", east: "double precision", north: "double precision", area_m2: "integer",
    },
    toTaxBlockRows(await joiner.blocks()),
    `ON CONFLICT (block_id) DO UPDATE SET label = excluded.label, nta2020 = excluded.nta2020, west = excluded.west,
      south = excluded.south, east = excluded.east, north = excluded.north, area_m2 = excluded.area_m2, updated_at = now()`,
  );
  await octoQuery(
    s.dateField
      ? "DELETE FROM raw.source_block_cells WHERE source_id = $1 AND month >= $2::date"
      : "DELETE FROM raw.source_block_cells WHERE source_id = $1",
    s.dateField ? [s.id, deps.windowStart] : [s.id],
  );
  await insertJson("raw.source_block_cells", { source_id: "text", month: "date", block_id: "integer", n: "double precision" }, rows);
  return rows.length;
}
