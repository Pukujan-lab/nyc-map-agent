import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

/** Layers the street-level mini map keeps from the loaded style. Pure, for tests. */
export function keepInMini(l: { id: string; type: string; "source-layer"?: string }): boolean {
  if (l.type === "background") return true;
  if (l.type === "fill" && (l["source-layer"] === "water" || l["source-layer"] === "park")) return true;
  if (l.type === "line" && l["source-layer"] === "transportation") return true;
  if (l.id === "transit-station-raised") return true;
  return /^transit-(line|line-under|station|bullet)$/.test(l.id);
}

/**
 * A lightweight north-up style for the mini map, cut from the main map's
 * already-loaded style: land, water, parks, streets, subway lines, stations
 * and live trains. No labels, no 3D, no analytics. Pure.
 */
export function miniStyle(full: StyleSpecification): StyleSpecification {
  const layers = (full.layers ?? []).filter((l) => keepInMini(l as never));
  const used = new Set(layers.map((l) => (l as { source?: string }).source).filter(Boolean) as string[]);
  const sources = Object.fromEntries(Object.entries(full.sources ?? {}).filter(([id]) => used.has(id)));
  return {
    version: 8,
    sources,
    layers: layers.map((l) => {
      const next = { ...l, minzoom: undefined, maxzoom: undefined } as LayerSpecification;
      // The tilted map lifts this dot above the viaduct. The mini map is flat, so the dot sits on the station.
      if (next.id === "transit-station-raised" && next.type === "circle") next.paint = { ...next.paint, "circle-translate": [0, 0] };
      return next;
    }),
  };
}

/** CSS rotation for the heading cone on a north-up map: the camera yaw in degrees. Pure. */
export function coneRotation(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}
