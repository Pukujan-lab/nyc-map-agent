import type { WindowId } from "@/lib/windows";

export type DatasetId = "noise" | "crashes";

export type CountPair = [string, number];

export interface NtaAggregate {
  ntaCode: string;
  count: number;
  nightCount: number;
  weekendNightCount: number;
  /** 24 slots, index = hour of day (NYC local). */
  hours: number[];
  months: CountPair[];
  /**
   * Month-by-month `Noise - Helicopter` counts. Kept separately because
   * "helicopter complaints last summer" needs type × month, which the rest of
   * the rollup does not carry.
   */
  helicopterMonths: CountPair[];
  topTypes: CountPair[];
  topDescriptors: CountPair[];
  topFactors: CountPair[];
  injured: number;
  killed: number;
  cyclists: number;
  pedestrians: number;
  /** crashes + 3 × injured + 10 × killed */
  severity: number;
}

/**
 * One ~300 m grid square. Blocks are a fixed grid rather than census blocks so
 * noise and crashes can share the same key and stack on the same square.
 */
export interface BlockCell {
  key: string;
  /** South-west corner of the square. */
  lon: number;
  lat: number;
  /** Neighborhood of the first record in the square. */
  ntaCode: string;
  count: number;
  nightCount: number;
  injured: number;
  killed: number;
  cyclists: number;
}

export interface BoroughAggregate {
  borough: string;
  count: number;
  injured: number;
  killed: number;
  cyclists: number;
  factors: CountPair[];
}

export interface IntersectionRow {
  label: string;
  onStreet: string;
  crossStreet: string;
  ntaCode: string | null;
  borough: string;
  crashes: number;
  cyclists: number;
  injured: number;
  killed: number;
}

export interface SoqlSource {
  label: string;
  query: string;
}

export interface AggregateResult {
  dataset: DatasetId;
  windowId: WindowId;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  totalRows: number;
  unassignedCount: number;
  malformedCount: number;
  ntas: NtaAggregate[];
  /** ~300 m squares with at least one record; the "block by block" view. */
  blocks: BlockCell[];
  boroughs: BoroughAggregate[];
  intersections: IntersectionRow[];
  sources: SoqlSource[];
}

export interface AggregationProgress {
  loaded: number;
  total: number;
  phase: "counting" | "fetching" | "joining";
}

export type AggregateWorkerRequest = {
  dataset: DatasetId;
  windowId: WindowId;
  windowStart: string;
  windowEnd: string;
  boundaries: import("@/lib/api/nta").NtaBoundary[];
};

export type AggregateWorkerResponse =
  | ({ type: "progress" } & AggregationProgress)
  | { type: "done"; result: AggregateResult }
  | { type: "error"; message: string };
