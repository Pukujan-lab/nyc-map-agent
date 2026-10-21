import { z } from "zod";
import { api, unwrap } from "@/lib/api/client";
import { parseNtaBoundaries, type NtaBoundary } from "@/lib/api/nta";
import { parseDistrictBoundaries } from "@/lib/api/districts";
import type { NtaIndex } from "@/lib/geo/ntaIndex";
import type { AggregateResult, DatasetId } from "@/lib/geo/types";
import type { WindowId } from "@/lib/windows";
import { addCell, emptyCounts, type SourceCounts } from "./fetchSource";
import type { SourceConfig } from "./registry";
import type { paths } from "@/lib/api/schema";

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

export async function fetchSourceMeta(signal?: AbortSignal): Promise<Record<string, SourceMeta>> {
  const parsed = sourcesResponse.parse(unwrap("/api/v1/sources", await api.GET("/api/v1/sources", { signal })));
  return Object.fromEntries(parsed.sources.map((s) => [s.id, s]));
}

type BlocksQuery = NonNullable<paths["/api/v1/blocks"]["get"]["parameters"]["query"]>;

function blocksQuery(source: SourceConfig, windowId: WindowId, filters: DataFilters): BlocksQuery {
  const q: BlocksQuery = { source: source.id, window: windowId, level: "block" };
  if (filters.borough) q.borough = filters.borough as BlocksQuery["borough"];
  const cats = filters.categories[source.id];
  if (source.filters?.categories && cats?.length) q.categories = cats.join(",");
  if (source.filters?.severity && filters.severity.length) q.severity = filters.severity.join(",");
  return q;
}

/** The /api/v1/blocks URL for a query (shown as the data source's "query" link). */
export function blocksPath(source: SourceConfig, windowId: WindowId, filters: DataFilters): string {
  const q = new URLSearchParams(Object.entries(blocksQuery(source, windowId, filters)));
  return `/api/v1/blocks?${q}`;
}

const blockRow = z.object({ r: z.coerce.number(), c: z.coerce.number(), n: z.coerce.number() });

/** Same SourceCounts shape as the Socrata path, so the map code does not care where data came from. */
export async function fetchOctoCounts(
  source: SourceConfig,
  windowId: WindowId,
  filters: DataFilters,
  index: NtaIndex,
  signal?: AbortSignal,
): Promise<SourceCounts> {
  const path = blocksPath(source, windowId, filters);
  const res = await api.GET("/api/v1/blocks", { params: { query: blocksQuery(source, windowId, filters) }, signal });
  const body = z
    .object({ rows: z.array(blockRow), truncated: z.boolean().optional() })
    .parse(unwrap("/api/v1/blocks", res));
  const out = emptyCounts(source.id, [{ label: `${source.label} (Octo)`, query: `${API_BASE}${path}` }]);
  out.truncated = Boolean(body.truncated);
  for (const row of body.rows) addCell(out, index, row.r, row.c, row.n);
  return out;
}

/** Octo: simplified NTA / community-district shapes from /api/areas (no Socrata call). */
export async function fetchOctoAreas(level: "nta" | "cd", signal?: AbortSignal): Promise<NtaBoundary[]> {
  const payload = unwrap("/api/v1/areas", await api.GET("/api/v1/areas", { params: { query: { level } }, signal }));
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
  const res = await api.GET("/api/v1/aggregate", { params: { query: { dataset, window: windowId } }, signal });
  return unwrap("/api/v1/aggregate", res) as unknown as AggregateResult;
}
