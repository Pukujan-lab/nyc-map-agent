import { z } from "zod";
import { parseNtaBoundaries, type NtaBoundary } from "@/lib/api/nta";
import { parseDistrictBoundaries } from "@/lib/api/districts";
import type { NtaIndex } from "@/lib/geo/ntaIndex";
import type { AggregateResult, DatasetId } from "@/lib/geo/types";
import type { WindowId } from "@/lib/windows";
import { isBlockKeyed } from "./blockKeyed";
import { addCell, emptyCounts, type SourceCounts } from "./fetchSource";
import type { SourceConfig } from "./registry";

/** `octo` reads pre-aggregated marts through /api; `socrata` (default) queries NYC Open Data from the browser. */
export type DataBackend = "octo" | "socrata";
export const DATA_BACKEND: DataBackend = import.meta.env.VITE_DATA_BACKEND === "octo" ? "octo" : "socrata";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export interface DataFilters {
  borough?: string;
  /** Selected categories per source id (e.g. noise complaint types). */
  categories: Record<string, string[]>;
  /** Crash severities: fatal, injury, no injury. */
  severity: string[];
}

export const BOROUGHS = ["MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"] as const;

const option = z.object({ value: z.string(), n: z.coerce.number() });
const sourceMeta = z.object({
  id: z.string(),
  categories: z.array(option).default([]),
  severities: z.array(option).default([]),
  lastIngest: z.string().nullable().optional(),
});
const sourcesResponse = z.object({ sources: z.array(sourceMeta) });
export type SourceMeta = z.infer<typeof sourceMeta>;

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`API ${path.split("?")[0]} failed (${res.status})`);
  return res.json();
}

export async function fetchSourceMeta(signal?: AbortSignal): Promise<Record<string, SourceMeta>> {
  const parsed = sourcesResponse.parse(await getJson("/api/sources", signal));
  return Object.fromEntries(parsed.sources.map((s) => [s.id, s]));
}

export function blocksPath(source: SourceConfig, windowId: WindowId, filters: DataFilters): string {
  const q = new URLSearchParams({ source: source.id, window: windowId, level: "block" });
  if (filters.borough) q.set("borough", filters.borough);
  const cats = filters.categories[source.id];
  if (source.filters?.categories && cats?.length) q.set("categories", cats.join(","));
  if (source.filters?.severity && filters.severity.length) q.set("severity", filters.severity.join(","));
  return `/api/blocks?${q}`;
}

const blockRow = z.object({ r: z.coerce.number(), c: z.coerce.number(), n: z.coerce.number() });
/** Block-keyed sources: one row per real tax block, id = boro * 100000 + block (the block tiles' feature id). */
const taxBlockRow = z.object({
  block_id: z.coerce.number().int(),
  n: z.coerce.number(),
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  nta2020: z.string().nullish(),
});
type TaxBlockRow = z.infer<typeof taxBlockRow>;

/** Fills `out` from BBL-keyed rows; neighborhood totals are the sum of their blocks. */
export function addTaxBlocks(out: SourceCounts, rows: TaxBlockRow[]): void {
  for (const row of rows) {
    if (!(row.n > 0)) continue;
    const ntaCode = row.nta2020 ?? "";
    const key = String(row.block_id);
    const existing = out.blocks[key];
    if (existing) existing.count += row.n;
    else out.blocks[key] = { lat: row.lat, lon: row.lon, ntaCode, count: row.n };
    if (ntaCode) out.byNta[ntaCode] = (out.byNta[ntaCode] ?? 0) + row.n;
    out.total += row.n;
  }
}

/** Same SourceCounts shape as the Socrata path, so the map code does not care where data came from. */
export async function fetchOctoCounts(
  source: SourceConfig,
  windowId: WindowId,
  filters: DataFilters,
  index: NtaIndex,
  signal?: AbortSignal,
): Promise<SourceCounts> {
  const path = blocksPath(source, windowId, filters);
  const payload = await getJson(path, signal);
  const out = emptyCounts(source.id, [{ label: `${source.label} (Octo)`, query: `${API_BASE}${path}` }]);
  if (isBlockKeyed(source.id)) {
    const keyed = z.object({ rows: z.array(taxBlockRow), truncated: z.boolean().optional() }).parse(payload);
    out.truncated = Boolean(keyed.truncated);
    addTaxBlocks(out, keyed.rows);
    return out;
  }
  const body = z.object({ rows: z.array(blockRow), truncated: z.boolean().optional() }).parse(payload);
  out.truncated = Boolean(body.truncated);
  for (const row of body.rows) addCell(out, index, row.r, row.c, row.n);
  return out;
}

/** Octo: simplified NTA / community-district shapes from /api/areas (no Socrata call). */
export async function fetchOctoAreas(level: "nta" | "cd", signal?: AbortSignal): Promise<NtaBoundary[]> {
  const payload = await getJson(`/api/areas?level=${level}`, signal);
  const boundaries = level === "nta" ? parseNtaBoundaries(payload) : parseDistrictBoundaries(payload);
  if (boundaries.length === 0) throw new Error("Could not load area boundaries.");
  return boundaries;
}

/** Octo: the precomputed noise / crash rollup the Socrata worker would otherwise build. */
export async function fetchOctoAggregate(
  dataset: DatasetId,
  windowId: WindowId,
  signal?: AbortSignal,
): Promise<AggregateResult> {
  return (await getJson(`/api/aggregate?dataset=${dataset}&window=${windowId}`, signal)) as AggregateResult;
}
