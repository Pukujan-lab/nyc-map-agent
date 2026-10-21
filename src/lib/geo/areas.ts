import type { Feature, FeatureCollection, MultiPolygon, Point } from "geojson";
import type { NtaBoundary } from "@/lib/api/nta";
import type { BlockDatum, MapModel, MapScale } from "@/lib/layers";
import { heightFor } from "@/lib/layers";
import { NtaIndex } from "./ntaIndex";

/** One area at the chosen unit, ready for the choropleth and the top-areas list. */
export interface AreaDatum {
  code: string;
  name: string;
  borough: string;
  value: number;
  polygons: NtaBoundary["polygons"];
}

export interface AreaProperties {
  code: string;
  /** Value scaled 0–1 against the peak area, for the colour ramp. */
  t: number;
  height: number;
}

/**
 * Rolls the model up to the chosen unit. Counts are summed; under the Average
 * view the value is a 0–100 score, so areas take the mean of their blocks.
 */
export function buildAreas(params: {
  scale: MapScale;
  model: MapModel;
  boundaries: NtaBoundary[] | null;
  districts: NtaBoundary[] | null;
}): AreaDatum[] {
  const { scale, model, boundaries, districts } = params;
  const mean = model.view?.kind === "average";
  if (scale === "blocks") {
    return model.blocks.map((b) => ({
      code: b.key,
      name: b.label ?? `Block ${b.key}`,
      borough: "",
      value: b.value,
      // Real tax blocks are filled from their PMTiles (src/lib/map/blockTiles.ts).
      polygons: b.label ? [] : [b.polygon],
    }));
  }
  if (scale === "neighborhoods") {
    const byCode = new Map<string, AreaDatum>();
    for (const n of model.neighborhoods) {
      const area = byCode.get(n.ntaCode);
      if (area) area.polygons.push(n.polygon);
      else byCode.set(n.ntaCode, { code: n.ntaCode, name: n.ntaName, borough: n.borough, value: n.value, polygons: [n.polygon] });
    }
    return [...byCode.values()];
  }
  if (!boundaries) return [];
  const groups: NtaBoundary[] =
    scale === "districts" ? districts ?? [] : boroughBoundaries(boundaries);
  if (!groups.length) return [];
  const index = new NtaIndex(groups);
  const sums = new Map<string, { total: number; n: number }>();
  const add = (code: string | null, value: number) => {
    if (!code) return;
    const s = sums.get(code) ?? { total: 0, n: 0 };
    s.total += value;
    s.n += 1;
    sums.set(code, s);
  };
  if (scale === "boroughs") {
    const boroughOf = new Map(boundaries.map((b) => [b.ntaCode, b.borough]));
    const seen = new Set<string>();
    for (const n of model.neighborhoods) {
      if (seen.has(n.ntaCode)) continue;
      seen.add(n.ntaCode);
      add(boroughOf.get(n.ntaCode) ?? null, n.value);
    }
  } else {
    for (const b of model.blocks) add(blockArea(index, b), b.value);
  }
  return groups.map((g) => {
    const s = sums.get(g.ntaCode);
    const value = !s ? 0 : mean ? s.total / s.n : s.total;
    return { code: g.ntaCode, name: g.ntaName, borough: g.borough, value, polygons: g.polygons };
  });
}

function blockArea(index: NtaIndex, block: BlockDatum): string | null {
  return index.assignCode(block.center.lat, block.center.lon);
}

/** Borough "boundaries" are the union of their NTA polygons (no extra download). */
export function boroughBoundaries(boundaries: NtaBoundary[]): NtaBoundary[] {
  const by = new Map<string, NtaBoundary>();
  for (const b of boundaries) {
    const g = by.get(b.borough);
    if (!g) {
      by.set(b.borough, { ...b, ntaCode: b.borough, ntaName: b.borough, polygons: [...b.polygons], bbox: [...b.bbox] });
      continue;
    }
    g.polygons.push(...b.polygons);
    g.bbox = [
      Math.min(g.bbox[0], b.bbox[0]),
      Math.min(g.bbox[1], b.bbox[1]),
      Math.max(g.bbox[2], b.bbox[2]),
      Math.max(g.bbox[3], b.bbox[3]),
    ];
  }
  return [...by.values()];
}

export function areasToGeoJson(areas: AreaDatum[]): FeatureCollection<MultiPolygon, AreaProperties> {
  const max = areas.reduce((m, a) => (a.value > m ? a.value : m), 0);
  return {
    type: "FeatureCollection",
    features: areas
      .filter((a) => a.value > 0)
      .map(
        (a): Feature<MultiPolygon, AreaProperties> => ({
          type: "Feature",
          id: a.code,
          properties: {
            code: a.code,
            t: max > 0 ? Math.sqrt(a.value / max) : 0,
            height: heightFor(a.value, max),
          },
          geometry: { type: "MultiPolygon", coordinates: a.polygons },
        }),
      ),
  };
}

/** Block centres weighted 0–1, for the heatmap option. */
export function blockPointsToGeoJson(blocks: BlockDatum[]): FeatureCollection<Point, { w: number }> {
  const max = blocks.reduce((m, b) => (b.value > m ? b.value : m), 0);
  return {
    type: "FeatureCollection",
    features: blocks
      .filter((b) => b.value > 0)
      .map((b) => ({
        type: "Feature",
        properties: { w: max > 0 ? b.value / max : 0 },
        geometry: { type: "Point", coordinates: [b.center.lon, b.center.lat] },
      })),
  };
}
