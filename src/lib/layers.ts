import type { NtaBoundary, PolygonRings } from "@/lib/api/nta";
import { BLOCK_GRID_DEG, blockPolygon } from "@/lib/geo/blocks";
import type {
  AggregateResult,
  BlockCell,
  CountPair,
  NtaAggregate,
} from "@/lib/geo/types";

export type LayerId = "noise" | "crashes" | "combined";

export const LAYER_IDS: LayerId[] = ["noise", "crashes", "combined"];

export const LAYER_LABELS: Record<LayerId, string> = {
  noise: "Noise",
  crashes: "Crashes",
  combined: "Combined",
};

/** Same control, narrow enough to sit in the HUD dock. */
export const LAYER_SHORT_LABELS: Record<LayerId, string> = {
  noise: "Noise",
  crashes: "Crashes",
  combined: "Both",
};

/** What the block height actually counts, per layer. */
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

/** The geographic unit the map aggregates to. */
export type MapScale = "blocks" | "neighborhoods" | "districts" | "boroughs";

export const MAP_SCALES: MapScale[] = ["blocks", "neighborhoods", "districts", "boroughs"];

export const SCALE_LABELS: Record<MapScale, string> = {
  blocks: "Block (~300 m)",
  neighborhoods: "Neighborhood (NTA 2020)",
  districts: "Community district",
  boroughs: "Borough",
};

/** Plural headings ("Top neighborhoods") — appending "s" to a label with a parenthetical reads wrong. */
export const SCALE_PLURALS: Record<MapScale, string> = {
  blocks: "Blocks",
  neighborhoods: "Neighborhoods",
  districts: "Community districts",
  boroughs: "Boroughs",
};

export function parseMapScale(value: string | null): MapScale {
  return MAP_SCALES.includes(value as MapScale) ? (value as MapScale) : "neighborhoods";
}

/** How areas are drawn. `fill` is a flat choropleth; `columns` the 3D glass columns. */
export type MapStyleId = "fill" | "columns" | "heat";

export const MAP_STYLES: MapStyleId[] = ["fill", "columns", "heat"];

export const MAP_STYLE_LABELS: Record<MapStyleId, string> = {
  fill: "Filled areas",
  columns: "3D columns",
  heat: "Heatmap",
};

export function parseMapStyle(value: string | null): MapStyleId {
  return MAP_STYLES.includes(value as MapStyleId) ? (value as MapStyleId) : "fill";
}

/**
 * Column height is the map's only encoding: one number per area, on a square
 * root scale so a single extreme neighborhood does not flatten everywhere else
 * into the pavement. There is no colour ramp to disagree with it.
 */
export const MIN_COLUMN_METERS = 60;
export const MAX_COLUMN_METERS = 1800;

export function heightFor(value: number, maxValue: number): number {
  if (value <= 0) return 0;
  const ceiling = Math.max(maxValue, 1);
  const ratio = Math.sqrt(Math.min(value, ceiling) / ceiling);
  return Math.round(
    MIN_COLUMN_METERS + ratio * (MAX_COLUMN_METERS - MIN_COLUMN_METERS),
  );
}

/** One source's contribution to an area under the per-source / Average views. */
export interface SourceBreakdown {
  sourceId: string;
  value: number;
  /** Percentile rank 0–100; only set under the Average view. */
  percentile?: number;
  /** Average view only: true when the source counts as "higher is better". */
  inverted?: boolean;
  /** Average view only: contribution to the concern score (0–100). */
  concern?: number;
}

/** Set when the map shows a registry source or the Average composite. */
export interface ViewInfo {
  kind: "source" | "average";
  label: string;
  unit: string;
  /** Source ids that fed the value, in display order. */
  contributors: string[];
  /** Average only: contributors counted as "higher is better". */
  better?: string[];
}

export interface NeighborhoodDatum {
  id: string;
  ntaCode: string;
  ntaName: string;
  borough: string;
  polygon: PolygonRings;
  value: number;
  /** Column height in meters; 0 for areas with no records. */
  height: number;
  nightShare: number;
  noiseCount: number;
  crashCount: number;
  injured: number;
  killed: number;
  cyclists: number;
  /** House numbers from 311 `incident_address`, most frequent first. */
  addresses: CountPair[];
  /** Street names from crash records — that dataset carries no house number. */
  streets: CountPair[];
  breakdown?: SourceBreakdown[];
}

export interface BlockDatum {
  key: string;
  ntaCode: string;
  polygon: PolygonRings;
  /** Centre of the square — where "walk this block" puts the camera. */
  center: { lon: number; lat: number };
  value: number;
  /** Column height in meters; 0 for squares with no records. */
  height: number;
  nightCount: number;
  noiseCount: number;
  crashCount: number;
  injured: number;
  killed: number;
  cyclists: number;
  /** House numbers from 311 `incident_address`, most frequent first. */
  addresses: CountPair[];
  /** Street names from crash records — that dataset carries no house number. */
  streets: CountPair[];
  breakdown?: SourceBreakdown[];
}

export interface MapModel {
  layer: LayerId;
  scale: MapScale;
  neighborhoods: NeighborhoodDatum[];
  blocks: BlockDatum[];
  /** Peak value on the current scale — the top of the height scale. */
  maxValue: number;
  /** Areas on the current scale with at least one record. */
  areasWithData: number;
  /** Absent under the classic noise / crashes / combined layers. */
  view?: ViewInfo;
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
  topAddresses: [],
  topStreets: [],
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
  addresses: CountPair[];
  streets: CountPair[];
}

/** Two address lists, merged by label and capped — the square stays small. */
const BLOCK_ADDRESS_LIMIT = 3;

function mergePairs(lists: Array<CountPair[] | undefined>, limit: number): CountPair[] {
  const totals = new Map<string, number>();
  for (const list of lists) {
    for (const [label, value] of list ?? []) {
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]): CountPair => [label, value]);
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
          addresses: [],
          streets: [],
        };
        merged.set(cell.key, entry);
      }
      if (dataset === "noise") {
        entry.noiseCount += cell.count;
        entry.nightCount += cell.nightCount;
        entry.addresses = mergePairs(
          [entry.addresses, cell.addresses],
          BLOCK_ADDRESS_LIMIT,
        );
      } else {
        entry.crashCount += cell.count;
        entry.injured += cell.injured;
        entry.killed += cell.killed;
        entry.cyclists += cell.cyclists;
        entry.streets = mergePairs(
          [entry.streets, cell.streets],
          BLOCK_ADDRESS_LIMIT,
        );
      }
    }
  };

  add(noise?.blocks, "noise");
  add(crashes?.blocks, "crashes");
  return merged;
}

/**
 * Single source of truth for the map: each area's value and the column height
 * it produces are computed together, so the map and the key can never disagree.
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
      maxValue: 0,
      areasWithData: 0,
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
  const neighborhoodMax = neighborhoodValues.reduce(
    (max, value) => (value > max ? value : max),
    0,
  );

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
        height: heightFor(row.value, neighborhoodMax),
        nightShare: row.nightShare,
        noiseCount: row.noiseAgg.count,
        crashCount: row.crashAgg.count,
        injured: row.crashAgg.injured,
        killed: row.crashAgg.killed,
        cyclists: row.crashAgg.cyclists,
        addresses: row.noiseAgg.topAddresses ?? [],
        streets: row.crashAgg.topStreets ?? [],
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

  const blockMax = blockValues.reduce(
    (max, value) => (value > max ? value : max),
    0,
  );
  const blocks: BlockDatum[] = blockRows.map(({ key, entry, value }) => ({
    key,
    ntaCode: entry.ntaCode,
    polygon: blockPolygon(entry.lon, entry.lat),
    center: {
      lon: entry.lon + BLOCK_GRID_DEG / 2,
      lat: entry.lat + BLOCK_GRID_DEG / 2,
    },
    value,
    height: heightFor(value, blockMax),
    nightCount: entry.nightCount,
    noiseCount: entry.noiseCount,
    crashCount: entry.crashCount,
    injured: entry.injured,
    killed: entry.killed,
    cyclists: entry.cyclists,
    addresses: entry.addresses,
    streets: entry.streets,
  }));

  const shownValues = scale === "blocks" ? blockValues : neighborhoodValues;

  return {
    layer,
    scale,
    neighborhoods,
    blocks,
    maxValue: shownValues.reduce((max, value) => (value > max ? value : max), 0),
    areasWithData: shownValues.filter((value) => value > 0).length,
  };
}
