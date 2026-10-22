import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Calm buildings (#174): flat 2D footprints in a tint barely darker than the
 * land, no outlines and no extrusion; the density-shaded block fills go plain.
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

const saved = new WeakMap<MapLibreMap, Map<string, { vis: unknown; min?: number; max?: number; color: unknown; outline: unknown }>>();

export function applyBuildings(map: MapLibreMap, flat: boolean, tint: string): void {
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
        color: foot ? map.getPaintProperty(l.id, "fill-color") : undefined,
        outline: foot ? map.getPaintProperty(l.id, "fill-outline-color") : undefined,
      });
    }
    const o = store.get(l.id)!;
    if (hide) map.setLayoutProperty(l.id, "visibility", flat ? "none" : ((o.vis as "visible" | "none" | undefined) ?? "visible"));
    if (foot) {
      map.setLayerZoomRange(l.id, flat ? 13 : (o.min ?? 0), flat ? 24 : (o.max ?? 24));
      map.setPaintProperty(l.id, "fill-color", flat ? tint : o.color);
      map.setPaintProperty(l.id, "fill-outline-color", flat ? tint : o.outline);
    }
  }
}
