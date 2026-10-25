import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Calm buildings (#174): flat 2D footprints in a tint clearly darker than the
 * land with a thin darker edge, no outlines and no extrusion; the density-shaded block fills go plain.
 * 3D (extruded basemap buildings, textured city, skyline) is kept for when
 * the person picks Map detail > 3D buildings. Originals are restored exactly.
 */
type Layer = { id: string; type: string; "source-layer"?: string; minzoom?: number; maxzoom?: number };

/** Basemap 3D buildings and the app's density shading, hidden when flat. Pure, for tests. */
export function hiddenWhenFlat(l: Layer): boolean {
  return (l.type === "fill-extrusion" && l["source-layer"] === "building") || l.id === "block-tile-fill";
}
/** The basemap's 2D footprint layer, stretched to every zoom when flat. */
export function isFootprint(l: Layer): boolean {
  return l.type === "fill" && l["source-layer"] === "building";
}

/** Flat applies at street level too. Only Map detail > 3D buildings extrudes and loads the textured city. */
export function wantsFlatBuildings(choice: "flat" | "3d"): boolean {
  return choice !== "3d";
}

/** How the camera looks at the city: straight down, tilted (Mid / Up), or walking. */
export type MapLevel = "top" | "tilted" | "street";

export function mapLevel(walking: boolean, tilted: boolean): MapLevel {
  return walking ? "street" : tilted ? "tilted" : "top";
}

export interface CityDetail {
  /** Basemap buildings drawn as fill-extrusions instead of flat footprints. */
  extrude: boolean;
  /** The z11-14 distance skyline from the city tiles. */
  skyline: boolean;
  /** The textured city: facades, props and its three.js layers (signs, landmarks, storefronts). */
  textured: boolean;
}

/**
 * What 3D the map draws at a level. Pure, for tests.
 *
 * - Top: a flat 2D overview (#364). No extrusions, skyline or textured city,
 *   so no three.js layer either.
 * - Tilted (Mid / Up): a simple block map (#363). The basemap's own buildings
 *   as plain theme-coloured extrusions, whatever the Flat / 3D choice. The
 *   skyline and textured city (facades, props, hero landmark models,
 *   storefront signs) are the optional detailed city: the `detailedCity`
 *   flag, advanced tier, off by default.
 * - Street: unchanged. The Flat / 3D choice and the textured-city toggle decide.
 */
export function cityDetail(o: { level: MapLevel; flat: boolean; eco: boolean; city3d: boolean; detailed: boolean }): CityDetail {
  if (o.level === "top") return { extrude: false, skyline: false, textured: false };
  if (o.level === "tilted") {
    const detailed = o.detailed && !o.eco;
    return { extrude: true, skyline: detailed, textured: detailed };
  }
  // Street level is always the 3D city (buildings, storefronts, signs) unless Eco is on:
  // the Flat choice is for the overview, and a flat street read as an empty plane (owner, 2026-10-24).
  const extrude = !o.eco;
  return { extrude, skyline: extrude, textured: extrude && o.city3d };
}

const saved = new WeakMap<MapLibreMap, Map<string, { vis: unknown; min?: number; max?: number; color: unknown; outline: unknown }>>();

/**
 * `flat` draws footprints instead of extrusions; `plainBlocks` (default: same
 * as `flat`) hides the density-shaded block fill, which is the Flat choice and
 * not a 3D cost, so Top view keeps it.
 */
export function applyBuildings(map: MapLibreMap, flat: boolean, tint: string, edge: string = tint, plainBlocks: boolean = flat): void {
  let store = saved.get(map);
  if (!store) { store = new Map<string, { vis: unknown; min?: number; max?: number; color: unknown; outline: unknown }>(); saved.set(map, store); }
  for (const l of (map.getStyle()?.layers ?? []) as Layer[]) {
    const hide = hiddenWhenFlat(l);
    const foot = isFootprint(l);
    if (!hide && !foot) continue;
    if (!store.has(l.id)) {
      store.set(l.id, {
        vis: map.getLayoutProperty(l.id, "visibility"),
        min: l.minzoom,
        max: l.maxzoom,
        color: foot ? map.getPaintProperty(l.id, "fill-color") : l.type === "fill-extrusion" ? map.getPaintProperty(l.id, "fill-extrusion-color") : undefined,
        outline: foot ? map.getPaintProperty(l.id, "fill-outline-color") : undefined,
      });
    }
    const o = store.get(l.id)!;
    const off = l.id === "block-tile-fill" ? plainBlocks : flat;
    if (hide) map.setLayoutProperty(l.id, "visibility", off ? "none" : ((o.vis as "visible" | "none" | undefined) ?? "visible"));
    // 3D: extrusions take the theme's building tint so they read against the land (#2).
    if (hide && l.type === "fill-extrusion" && !flat) map.setPaintProperty(l.id, "fill-extrusion-color", tint);
    if (foot) {
      map.setLayerZoomRange(l.id, flat ? 13 : (o.min ?? 0), flat ? 24 : (o.max ?? 24));
      map.setPaintProperty(l.id, "fill-color", flat ? tint : o.color);
      map.setPaintProperty(l.id, "fill-outline-color", flat ? edge : o.outline);
    }
  }
}
