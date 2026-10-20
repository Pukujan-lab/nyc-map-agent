import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { PolygonRings } from "@/lib/api/nta";
import {
  rgbaToCss,
  type BlockDatum,
  type NeighborhoodDatum,
  type Rgba,
} from "@/lib/layers";

/**
 * Turns the computed map model into GeoJSON for MapLibre's own `fill-extrusion`
 * layers. Only the paint inputs travel as feature properties — color and
 * height. Everything else (names, counts, per-layer detail) stays in the
 * datum maps, which the hover card and details panel read directly, so a
 * number can never be duplicated into two places and drift.
 */

export interface ColumnProperties {
  color: string;
  height: number;
}

export type ColumnFeature = Feature<Polygon, ColumnProperties>;

function column(
  id: string,
  rings: PolygonRings,
  fill: Rgba,
  height: number,
): ColumnFeature {
  return {
    type: "Feature",
    id,
    properties: { color: rgbaToCss(fill), height },
    geometry: { type: "Polygon", coordinates: rings },
  };
}

export function neighborhoodsToGeoJson(
  neighborhoods: NeighborhoodDatum[],
): FeatureCollection<Polygon, ColumnProperties> {
  return {
    type: "FeatureCollection",
    features: neighborhoods.map((datum) =>
      column(datum.id, datum.polygon, datum.fill, datum.height),
    ),
  };
}

export function blocksToGeoJson(
  blocks: BlockDatum[],
): FeatureCollection<Polygon, ColumnProperties> {
  return {
    type: "FeatureCollection",
    features: blocks.map((block) =>
      column(block.key, block.polygon, block.fill, block.height),
    ),
  };
}

export type EmphasisTone = "selected" | "highlight";

export interface EmphasisProperties {
  tone: EmphasisTone;
}

/** Neighborhood outlines for the agent's `highlight` calls and the selection. */
export function emphasisToGeoJson(
  neighborhoods: NeighborhoodDatum[],
  highlightedNtaCodes: string[],
  selectedNtaCode: string | null,
): FeatureCollection<Polygon, EmphasisProperties> {
  const highlighted = new Set(highlightedNtaCodes);
  const features: Feature<Polygon, EmphasisProperties>[] = [];
  for (const datum of neighborhoods) {
    const isSelected = datum.ntaCode === selectedNtaCode;
    if (!isSelected && !highlighted.has(datum.ntaCode)) continue;
    features.push({
      type: "Feature",
      id: datum.id,
      properties: { tone: isSelected ? "selected" : "highlight" },
      geometry: { type: "Polygon", coordinates: datum.polygon },
    });
  }
  return { type: "FeatureCollection", features };
}

export function blockSelectionToGeoJson(
  block: BlockDatum | null,
): FeatureCollection<Polygon, Record<string, never>> {
  return {
    type: "FeatureCollection",
    features: block
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: block.polygon },
          },
        ]
      : [],
  };
}
