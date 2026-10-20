import type { NtaBoundary } from "@/lib/api/nta";
import type { AggregateResult, NtaAggregate } from "@/lib/geo/types";

export type LayerId = "noise" | "crashes" | "combined";

export const LAYER_IDS: LayerId[] = ["noise", "crashes", "combined"];

export const LAYER_LABELS: Record<LayerId, string> = {
  noise: "Noise",
  crashes: "Crashes",
  combined: "Combined",
};

export const LAYER_METRICS: Record<
  LayerId,
  { height: string; color: string }
> = {
  noise: { height: "noise complaints", color: "night share (10pm–4am)" },
  crashes: {
    height: "crashes",
    color: "severity (crashes + 3×injured + 10×killed)",
  },
  combined: { height: "all incidents", color: "blended severity" },
};

export function parseLayerId(value: string | null): LayerId {
  return value === "crashes" || value === "combined" ? value : "noise";
}

type Rgb = [number, number, number];

const RAMPS: Record<LayerId, { from: Rgb; to: Rgb }> = {
  noise: { from: [37, 99, 235], to: [251, 146, 60] },
  crashes: { from: [13, 148, 136], to: [239, 68, 68] },
  combined: { from: [79, 70, 229], to: [249, 115, 22] },
};

export const MAX_ELEVATION_METERS = 8000;

function toHex([r, g, b]: Rgb): string {
  const part = (value: number) => value.toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rampHex(layer: LayerId): { from: string; to: string } {
  return { from: toHex(RAMPS[layer].from), to: toHex(RAMPS[layer].to) };
}

export function colorFor(layer: LayerId, t: number): [number, number, number, number] {
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const { from, to } = RAMPS[layer];
  return [
    Math.round(from[0] + (to[0] - from[0]) * clamped),
    Math.round(from[1] + (to[1] - from[1]) * clamped),
    Math.round(from[2] + (to[2] - from[2]) * clamped),
    215,
  ];
}

export interface ColumnDatum {
  id: string;
  ntaCode: string;
  ntaName: string;
  borough: string;
  /** Polygon rings: [outerRing, ...holes] with [lon, lat] positions. */
  polygon: number[][][];
  count: number;
  heightValue: number;
  height: number;
  color: [number, number, number, number];
  nightShare: number;
  severityRatio: number;
  noiseCount: number;
  crashCount: number;
  injured: number;
  killed: number;
  cyclists: number;
}

export interface ColumnModel {
  data: ColumnDatum[];
  maxHeightValue: number;
  maxSeverity: number;
  layer: LayerId;
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

export function buildColumnModel(params: {
  boundaries: NtaBoundary[] | null;
  noise: AggregateResult | null;
  crashes: AggregateResult | null;
  layer: LayerId;
}): ColumnModel {
  const { boundaries, noise, crashes, layer } = params;
  if (!boundaries || (!noise && !crashes)) {
    return { data: [], maxHeightValue: 0, maxSeverity: 0, layer };
  }

  const noiseByNta = indexAggregates(noise);
  const crashByNta = indexAggregates(crashes);

  let maxHeightValue = 0;
  let maxSeverity = 0;
  let maxNoiseNight = 0;

  const raw = boundaries.map((boundary) => {
    const noiseAgg = noiseByNta.get(boundary.ntaCode) ?? EMPTY_AGGREGATE;
    const crashAgg = crashByNta.get(boundary.ntaCode) ?? EMPTY_AGGREGATE;
    const nightShare = noiseAgg.count > 0 ? noiseAgg.nightCount / noiseAgg.count : 0;
    const severity = crashAgg.severity;
    if (noiseAgg.count + crashAgg.count > maxHeightValue) {
      maxHeightValue = noiseAgg.count + crashAgg.count;
    }
    if (severity > maxSeverity) maxSeverity = severity;
    if (nightShare > maxNoiseNight) maxNoiseNight = nightShare;
    return { boundary, noiseAgg, crashAgg, nightShare, severity };
  });

  const data: ColumnDatum[] = [];
  for (const entry of raw) {
    const { boundary, noiseAgg, crashAgg, nightShare, severity } = entry;
    const heightValue =
      layer === "noise"
        ? noiseAgg.count
        : layer === "crashes"
          ? crashAgg.count
          : noiseAgg.count + crashAgg.count;

    const severityRatio = maxSeverity > 0 ? severity / maxSeverity : 0;
    const nightRatio = maxNoiseNight > 0 ? nightShare / maxNoiseNight : 0;
    const colorT =
      layer === "noise"
        ? nightRatio
        : layer === "crashes"
          ? severityRatio
          : (severityRatio + nightRatio) / 2;

    const height =
      maxHeightValue > 0
        ? Math.sqrt(heightValue / maxHeightValue) * MAX_ELEVATION_METERS
        : 0;

    boundary.polygons.forEach((polygon, partIndex) => {
      data.push({
        id: `${boundary.ntaCode}:${partIndex}`,
        ntaCode: boundary.ntaCode,
        ntaName: boundary.ntaName,
        borough: boundary.borough,
        polygon,
        count: heightValue,
        heightValue,
        height,
        color: colorFor(layer, colorT),
        nightShare,
        severityRatio,
        noiseCount: noiseAgg.count,
        crashCount: crashAgg.count,
        injured: crashAgg.injured,
        killed: crashAgg.killed,
        cyclists: crashAgg.cyclists,
      });
    });
  }

  return { data, maxHeightValue, maxSeverity, layer };
}
