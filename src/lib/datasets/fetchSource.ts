import { z } from "zod";
import { escapeSoqlString, isInNyc } from "@/lib/api/noise";
import { buildSocrataUrl, fetchSocrataJson } from "@/lib/api/socrata";
import { BLOCK_GRID_DEG, blockKey } from "@/lib/geo/blocks";
import type { NtaIndex } from "@/lib/geo/ntaIndex";
import type { AggregateResult, SoqlSource } from "@/lib/geo/types";
import type { WindowBounds } from "@/lib/windows";
import type { GeometrySource, GridSource, SourceConfig } from "./registry";

/** One source, reduced to a count per neighborhood and per block square. */
export interface SourceCounts {
  sourceId: string;
  byNta: Record<string, number>;
  blocks: Record<string, SourceBlock>;
  total: number;
  /** True when a row cap stopped the fetch before the dataset ended. */
  truncated: boolean;
  sources: SoqlSource[];
}

export interface SourceBlock {
  /** South-west corner, like `BlockCell`. */
  lat: number;
  lon: number;
  ntaCode: string;
  count: number;
}

const GRID_LIMIT = 50_000;
const PAGE_SIZE = 50_000;

function columnExpr(column: string, cast: boolean | undefined): string {
  return cast ? `${column}::number` : column;
}

function windowClause(field: string | undefined, bounds: WindowBounds | null): string[] {
  if (!field || !bounds) return [];
  return [
    `${field} > '${escapeSoqlString(bounds.startIso)}'`,
    `${field} < '${escapeSoqlString(bounds.endIso)}'`,
  ];
}

/** SoQL for a server-side block-grid rollup. Exported for tests. */
export function gridQuery(source: GridSource, bounds: WindowBounds | null): Record<string, string> {
  const lat = columnExpr(source.lat, source.castNumber);
  const lon = columnExpr(source.lon, source.castNumber);
  const measure = source.measure ?? "count";
  const value =
    measure === "count"
      ? "count(*)"
      : `sum(${columnExpr(measure.slice(4), true)})`;
  const where = [
    `${source.lat} IS NOT NULL`,
    `${source.lon} IS NOT NULL`,
    ...windowClause(source.dateField, bounds),
    ...(source.where ? [source.where] : []),
  ].join(" AND ");
  return {
    $select: `floor(${lat} / ${BLOCK_GRID_DEG}) AS r, floor(${lon} / ${BLOCK_GRID_DEG}) AS c, ${value} AS n`,
    $where: where,
    $group: "r, c",
    $limit: String(GRID_LIMIT),
  };
}

const gridRow = z.object({
  r: z.coerce.number().finite(),
  c: z.coerce.number().finite(),
  n: z.coerce.number().finite().nullish(),
});

export function emptyCounts(sourceId: string, sources: SoqlSource[]): SourceCounts {
  return { sourceId, byNta: {}, blocks: {}, total: 0, truncated: false, sources };
}

export function addCell(
  out: SourceCounts,
  index: NtaIndex,
  row: number,
  col: number,
  count: number,
): void {
  if (!(count > 0)) return;
  const lat = row * BLOCK_GRID_DEG;
  const lon = col * BLOCK_GRID_DEG;
  const centerLat = lat + BLOCK_GRID_DEG / 2;
  const centerLon = lon + BLOCK_GRID_DEG / 2;
  if (!isInNyc(centerLat, centerLon)) return;
  // A square is credited to the neighborhood under its centre — the same
  // approximation the map uses when it draws one square in one place.
  const ntaCode = index.assignCode(centerLat, centerLon);
  if (!ntaCode) return;
  const key = `${row}:${col}`;
  const existing = out.blocks[key];
  if (existing) existing.count += count;
  else
    out.blocks[key] = {
      lat: Math.round(lat * 1e4) / 1e4,
      lon: Math.round(lon * 1e4) / 1e4,
      ntaCode,
      count,
    };
  out.byNta[ntaCode] = (out.byNta[ntaCode] ?? 0) + count;
  out.total += count;
}

async function fetchGrid(
  source: GridSource,
  bounds: WindowBounds | null,
  index: NtaIndex,
  signal?: AbortSignal,
): Promise<SourceCounts> {
  const params = gridQuery(source, bounds);
  const out = emptyCounts(source.id, [
    { label: source.label, query: buildSocrataUrl(source.datasetId, "json", params) },
  ]);
  const rows = await fetchSocrataJson<unknown[]>(source.datasetId, params, signal);
  out.truncated = rows.length >= GRID_LIMIT;
  for (const raw of rows) {
    const parsed = gridRow.safeParse(raw);
    if (!parsed.success) continue;
    addCell(out, index, parsed.data.r, parsed.data.c, parsed.data.n ?? 0);
  }
  return out;
}

type Position = [number, number];

/**
 * One representative point for a GeoJSON geometry: the point itself, or the
 * middle vertex of the first part of a line / multipoint. Exported for tests.
 */
export function representativePoint(geometry: unknown): Position | null {
  const parsed = z
    .object({ type: z.string(), coordinates: z.unknown() })
    .safeParse(geometry);
  if (!parsed.success) return null;
  const { type, coordinates } = parsed.data;
  const isPos = (value: unknown): value is Position =>
    Array.isArray(value) &&
    typeof value[0] === "number" &&
    typeof value[1] === "number";
  const middle = (list: unknown): Position | null => {
    if (!Array.isArray(list) || list.length === 0) return null;
    const pick = list[Math.floor(list.length / 2)];
    return isPos(pick) ? pick : null;
  };
  if (type === "Point") return isPos(coordinates) ? coordinates : null;
  if (type === "MultiPoint" || type === "LineString") return middle(coordinates);
  if (type === "MultiLineString" && Array.isArray(coordinates)) {
    return middle(coordinates[0]);
  }
  return null;
}

async function fetchGeometry(
  source: GeometrySource,
  bounds: WindowBounds | null,
  index: NtaIndex,
  signal?: AbortSignal,
): Promise<SourceCounts> {
  const where = [
    `${source.geom} IS NOT NULL`,
    ...windowClause(source.dateField, bounds),
    ...(source.where ? [source.where] : []),
  ].join(" AND ");
  const base = { $select: source.geom, $where: where, $order: ":id" };
  const out = emptyCounts(source.id, [
    {
      label: source.label,
      query: buildSocrataUrl(source.datasetId, "json", {
        ...base,
        $limit: String(PAGE_SIZE),
      }),
    },
  ]);

  let offset = 0;
  for (;;) {
    const limit = Math.min(PAGE_SIZE, source.maxRows - offset);
    if (limit <= 0) {
      out.truncated = true;
      break;
    }
    const rows = await fetchSocrataJson<Array<Record<string, unknown>>>(
      source.datasetId,
      { ...base, $limit: String(limit), $offset: String(offset) },
      signal,
    );
    for (const row of rows) {
      const point = representativePoint(row[source.geom]);
      if (!point) continue;
      const [lon, lat] = point;
      const cell = blockKey(lat, lon);
      const [r, c] = cell.key.split(":").map(Number);
      addCell(out, index, r, c, 1);
    }
    offset += rows.length;
    if (rows.length < limit) break;
  }
  return out;
}

/** Per-area counts out of the existing noise / crash worker aggregate. */
export function countsFromAggregate(
  sourceId: string,
  result: AggregateResult,
): SourceCounts {
  const out = emptyCounts(sourceId, result.sources);
  for (const nta of result.ntas) {
    if (nta.count > 0) out.byNta[nta.ntaCode] = nta.count;
    out.total += nta.count;
  }
  for (const cell of result.blocks ?? []) {
    out.blocks[cell.key] = {
      lat: cell.lat,
      lon: cell.lon,
      ntaCode: cell.ntaCode,
      count: cell.count,
    };
  }
  return out;
}

export function fetchSourceCounts(
  source: Exclude<SourceConfig, { kind: "builtin" }>,
  bounds: WindowBounds,
  index: NtaIndex,
  signal?: AbortSignal,
): Promise<SourceCounts> {
  return source.kind === "grid"
    ? fetchGrid(source, source.dateField ? bounds : null, index, signal)
    : fetchGeometry(source, source.dateField ? bounds : null, index, signal);
}

