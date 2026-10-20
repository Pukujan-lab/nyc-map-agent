import type { Feature, FeatureCollection, Polygon, Position } from "geojson";
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

export interface SelectionProperties {
  /** Rises above the block's own column so the rim is never buried by it. */
  height: number;
}

/**
 * The rim is a fraction of the block, not a fixed distance: at the citywide
 * blocks view a 9 m band would be one pixel wide and read as nothing at all.
 */
const RIM_RATIO = 0.16;
/** The rim clears the column by this much, so a tilted view still shows it. */
const RIM_LIFT_METERS = 18;

function bounds(ring: Position[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * The picked block as a thin raised band around its own square: a white rim
 * that reads from directly above and, when the map is tilted or you are walking
 * through it, as a wall standing beside the column. A filled shell would fight
 * the block's own faces for depth; a band sits outside them, so it never
 * flickers.
 */
export function blockSelectionToGeoJson(
  block: BlockDatum | null,
): FeatureCollection<Polygon, SelectionProperties> {
  if (!block) return { type: "FeatureCollection", features: [] };
  const { minX, minY, maxX, maxY } = bounds(block.polygon[0]);
  const dx = (maxX - minX) * RIM_RATIO;
  const dy = (maxY - minY) * RIM_RATIO;
  const outer: Position[] = [
    [minX - dx, minY - dy],
    [maxX + dx, minY - dy],
    [maxX + dx, maxY + dy],
    [minX - dx, maxY + dy],
    [minX - dx, minY - dy],
  ];
  // Holes are wound the other way round from their outer ring.
  const inner: Position[] = [...block.polygon[0]].reverse();

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { height: block.height + RIM_LIFT_METERS },
        geometry: { type: "Polygon", coordinates: [outer, inner] },
      },
    ],
  };
}
