import type { NtaBoundary, PolygonRings } from "@/lib/api/nta";
import { formatCount } from "@/lib/format";
import { blockPolygon } from "@/lib/geo/blocks";
import type { AggregateResult, BlockCell, NtaAggregate } from "@/lib/geo/types";

export type LayerId = "noise" | "crashes" | "combined";

export const LAYER_IDS: LayerId[] = ["noise", "crashes", "combined"];

export const LAYER_LABELS: Record<LayerId, string> = {
  noise: "Noise",
  crashes: "Crashes",
  combined: "Combined",
};

/** What the block color actually counts, per layer. */
export const LAYER_METRICS: Record<LayerId, { value: string; unit: string }> = {
  noise: { value: "noise complaints", unit: "complaints" },
  crashes: { value: "crashes", unit: "crashes" },
  combined: { value: "noise + crashes", unit: "incidents" },
};

export function parseLayerId(value: string | null): LayerId {
  return value === "crashes" || value === "combined" ? value : "noise";
}

/** Citywide framing: the initial view, "reset view", and the scale switch. */
export const HOME_VIEW = {
  lon: -73.94,
  lat: 40.7,
  neighborhoodZoom: 11,
  blockZoom: 13,
} as const;

/** How coarse the map draws: whole neighborhoods, or ~300 m squares. */
export type MapScale = "neighborhoods" | "blocks";

export const MAP_SCALES: MapScale[] = ["neighborhoods", "blocks"];

export const SCALE_LABELS: Record<MapScale, string> = {
  neighborhoods: "Neighborhoods",
  blocks: "Blocks",
};

export function parseMapScale(value: string | null): MapScale {
  return value === "blocks" ? "blocks" : "neighborhoods";
}

export type BucketIndex = 0 | 1 | 2 | 3;

type Rgba = [number, number, number, number];

interface PaletteEntry {
  label: string;
  hex: string;
  rgba: Rgba;
}

/**
 * Four flat colors, low to high: blue → green → yellow → red. Deliberately
 * categorical (not a gradient) so a block reads as "which of four bands" at a
 * glance instead of "somewhere on a ramp".
 */
const PALETTE: PaletteEntry[] = [
  { label: "Low", hex: "#3b82f6", rgba: [59, 130, 246, 205] },
  { label: "Moderate", hex: "#22c55e", rgba: [34, 197, 94, 205] },
  { label: "High", hex: "#facc15", rgba: [250, 204, 21, 215] },
  { label: "Very high", hex: "#ef4444", rgba: [239, 68, 68, 225] },
];

/** Neighborhoods and blocks with no records stay visible but washed out. */
export const NO_DATA_FILL: Rgba = [148, 163, 184, 26];

export interface Bucket {
  index: BucketIndex;
  label: string;
  hex: string;
  rgba: Rgba;
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound; `null` on the open-ended top bucket. */
  max: number | null;
  /** How many areas fall in this bucket. */
  count: number;
}

/** Upper bounds of buckets 0, 1 and 2. */
export type Thresholds = [number, number, number];

/**
 * Quartile cuts over the non-zero values, so each color covers roughly a
 * quarter of the areas that have data. Counts are integers, so the cuts are
 * nudged apart to keep the four buckets disjoint even when many areas tie.
 */
export function thresholdsFor(values: number[]): Thresholds {
  const positives = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (positives.length === 0) return [0, 0, 0];
  const at = (quantile: number): number =>
    positives[
      Math.min(positives.length - 1, Math.max(0, Math.floor(quantile * positives.length)))
    ];
  const thresholds: Thresholds = [at(0.25), at(0.5), at(0.75)];
  if (thresholds[1] <= thresholds[0]) thresholds[1] = thresholds[0] + 1;
  if (thresholds[2] <= thresholds[1]) thresholds[2] = thresholds[1] + 1;
  return thresholds;
}

export function bucketFor(value: number, thresholds: Thresholds): BucketIndex {
  if (value <= thresholds[0]) return 0;
  if (value <= thresholds[1]) return 1;
  if (value <= thresholds[2]) return 2;
  return 3;
}

export function fillFor(value: number, thresholds: Thresholds): Rgba {
  if (value <= 0) return NO_DATA_FILL;
  return PALETTE[bucketFor(value, thresholds)].rgba;
}

export function buildBuckets(values: number[], thresholds: Thresholds): Bucket[] {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const value of values) {
    if (value <= 0) continue;
    counts[bucketFor(value, thresholds)] += 1;
  }
  return PALETTE.map((entry, index) => {
    const bucket = index as BucketIndex;
    return {
      index: bucket,
      label: entry.label,
      hex: entry.hex,
      rgba: entry.rgba,
      min: bucket === 0 ? 1 : thresholds[bucket - 1] + 1,
      max: bucket === 3 ? null : thresholds[bucket],
      count: counts[bucket],
    };
  });
}

/** Human label for a bucket's value range, e.g. "121–320". */
export function formatBucketRange(bucket: Bucket): string {
  if (bucket.max === null) return `${formatCount(bucket.min)}+`;
  if (bucket.index === 0) return `≤ ${formatCount(bucket.max)}`;
  return `${formatCount(bucket.min)}–${formatCount(bucket.max)}`;
}

export interface NeighborhoodDatum {
  id: string;
  ntaCode: string;
  ntaName: string;
  borough: string;
  polygon: PolygonRings;
  value: number;
  bucket: BucketIndex;
  fill: Rgba;
  nightShare: number;
  noiseCount: number;
  crashCount: number;
  injured: number;
  killed: number;
  cyclists: number;
}

export interface BlockDatum {
  key: string;
  ntaCode: string;
  polygon: PolygonRings;
  value: number;
  bucket: BucketIndex;
  fill: Rgba;
  nightCount: number;
  noiseCount: number;
  crashCount: number;
  injured: number;
  killed: number;
  cyclists: number;
}

export interface MapModel {
  layer: LayerId;
  scale: MapScale;
  neighborhoods: NeighborhoodDatum[];
  blocks: BlockDatum[];
  /** Buckets for whichever scale is on screen, so the legend cannot drift. */
  buckets: Bucket[];
  maxValue: number;
}

const EMPTY_AGGREGATE: NtaAggregate = {
  ntaCode: "",
  count: 0,
  nightCount: 0,
  weekendNightCount: 0,
  hours: new Array<number>(24).fill(0),
  months: [],
  helicopterMonths: [],
  topTypes: [],
  topDescriptors: [],
  topFactors: [],
  injured: 0,
  killed: 0,
  cyclists: 0,
  pedestrians: 0,
  severity: 0,
};

function indexAggregates(
  result: AggregateResult | null,
): Map<string, NtaAggregate> {
  const map = new Map<string, NtaAggregate>();
  if (!result) return map;
  for (const nta of result.ntas) map.set(nta.ntaCode, nta);
  return map;
}

function valueFor(layer: LayerId, noiseCount: number, crashCount: number): number {
  if (layer === "noise") return noiseCount;
  if (layer === "crashes") return crashCount;
  return noiseCount + crashCount;
}

interface BlockAcc {
  lon: number;
  lat: number;
  ntaCode: string;
  noiseCount: number;
  crashCount: number;
  nightCount: number;
  injured: number;
  killed: number;
  cyclists: number;
}

function mergeBlocks(
  noise: AggregateResult | null,
  crashes: AggregateResult | null,
): Map<string, BlockAcc> {
  const merged = new Map<string, BlockAcc>();

  const add = (cells: BlockCell[] | undefined, dataset: "noise" | "crashes") => {
    for (const cell of cells ?? []) {
      let entry = merged.get(cell.key);
      if (!entry) {
        entry = {
          lon: cell.lon,
          lat: cell.lat,
          ntaCode: cell.ntaCode,
          noiseCount: 0,
          crashCount: 0,
          nightCount: 0,
          injured: 0,
          killed: 0,
          cyclists: 0,
        };
        merged.set(cell.key, entry);
      }
      if (dataset === "noise") {
        entry.noiseCount += cell.count;
        entry.nightCount += cell.nightCount;
      } else {
        entry.crashCount += cell.count;
        entry.injured += cell.injured;
        entry.killed += cell.killed;
        entry.cyclists += cell.cyclists;
      }
    }
  };

  add(noise?.blocks, "noise");
  add(crashes?.blocks, "crashes");
  return merged;
}

/**
 * Single source of truth for the map: each area's value, its color bucket and
 * the legend's thresholds are computed together, so the colors on screen and
 * the legend can never disagree.
 */
export function buildMapModel(params: {
  boundaries: NtaBoundary[] | null;
  noise: AggregateResult | null;
  crashes: AggregateResult | null;
  layer: LayerId;
  scale: MapScale;
}): MapModel {
  const { boundaries, noise, crashes, layer, scale } = params;
  if (!boundaries || (!noise && !crashes)) {
    return {
      layer,
      scale,
      neighborhoods: [],
      blocks: [],
      buckets: [],
      maxValue: 0,
    };
  }

  const noiseByNta = indexAggregates(noise);
  const crashByNta = indexAggregates(crashes);

  const rows = boundaries.map((boundary) => {
    const noiseAgg = noiseByNta.get(boundary.ntaCode) ?? EMPTY_AGGREGATE;
    const crashAgg = crashByNta.get(boundary.ntaCode) ?? EMPTY_AGGREGATE;
    return {
      boundary,
      noiseAgg,
      crashAgg,
      value: valueFor(layer, noiseAgg.count, crashAgg.count),
      nightShare:
        noiseAgg.count > 0 ? noiseAgg.nightCount / noiseAgg.count : 0,
    };
  });

  const neighborhoodValues = rows.map((row) => row.value);
  const thresholds = thresholdsFor(neighborhoodValues);

  const neighborhoods: NeighborhoodDatum[] = [];
  for (const row of rows) {
    row.boundary.polygons.forEach((polygon, partIndex) => {
      neighborhoods.push({
        id: `${row.boundary.ntaCode}:${partIndex}`,
        ntaCode: row.boundary.ntaCode,
        ntaName: row.boundary.ntaName,
        borough: row.boundary.borough,
        polygon,
        value: row.value,
        bucket: bucketFor(row.value, thresholds),
        fill: fillFor(row.value, thresholds),
        nightShare: row.nightShare,
        noiseCount: row.noiseAgg.count,
        crashCount: row.crashAgg.count,
        injured: row.crashAgg.injured,
        killed: row.crashAgg.killed,
        cyclists: row.crashAgg.cyclists,
      });
    });
  }

  const mergedBlocks = mergeBlocks(noise, crashes);
  const blockValues: number[] = [];
  const blockRows: Array<{ key: string; entry: BlockAcc; value: number }> = [];
  for (const [key, entry] of mergedBlocks) {
    const value = valueFor(layer, entry.noiseCount, entry.crashCount);
    if (value <= 0) continue;
    blockValues.push(value);
    blockRows.push({ key, entry, value });
  }

  const blockThresholds = thresholdsFor(blockValues);
  const blocks: BlockDatum[] = blockRows.map(({ key, entry, value }) => ({
    key,
    ntaCode: entry.ntaCode,
    polygon: blockPolygon(entry.lon, entry.lat),
    value,
    bucket: bucketFor(value, blockThresholds),
    fill: fillFor(value, blockThresholds),
    nightCount: entry.nightCount,
    noiseCount: entry.noiseCount,
    crashCount: entry.crashCount,
    injured: entry.injured,
    killed: entry.killed,
    cyclists: entry.cyclists,
  }));

  const shownValues = scale === "blocks" ? blockValues : neighborhoodValues;
  const shownThresholds = scale === "blocks" ? blockThresholds : thresholds;

  return {
    layer,
    scale,
    neighborhoods,
    blocks,
    buckets: buildBuckets(shownValues, shownThresholds),
    maxValue: shownValues.reduce((max, value) => (value > max ? value : max), 0),
  };
}
