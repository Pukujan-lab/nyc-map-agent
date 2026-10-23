import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

/** Layers the street-level mini map keeps from the loaded style. Pure, for tests. */
export function keepInMini(l: { id: string; type: string; "source-layer"?: string }): boolean {
  if (l.id.startsWith("tunnel_")) return false;
  if (l.type === "background") return true;
  // Flat footprints. Extrusions stay off: the inset is a flat map, not a second 3D city.
  if (l.type === "fill" && l["source-layer"] === "building") return true;
  if (l.type === "fill" && (l["source-layer"] === "water" || l["source-layer"] === "park")) return true;
  if (l.type === "line" && l["source-layer"] === "transportation" && !/rail/.test(l.id)) return true;
  if (l.id === "transit-station-raised") return true;
  return /^transit-(line|line-under|station|bullet)$/.test(l.id);
}

/** Drop street-level pattern images and metre widths the inset does not have. */
export function miniLayer(l: LayerSpecification): LayerSpecification {
  const next = { ...l, minzoom: undefined, maxzoom: undefined } as LayerSpecification;
  if ((next.type === "line" || next.type === "fill") && next.paint) {
    const paint = { ...next.paint } as Record<string, unknown>;
    delete paint["line-pattern"];
    delete paint["fill-pattern"];
    if (next.type === "line") {
      paint["line-width"] = /casing/.test(next.id) ? 4 : 2;
      if (paint["line-opacity"] === 0) delete paint["line-opacity"];
    }
    next.paint = paint as typeof next.paint;
  }
  // The tilted map lifts this dot above the viaduct. The mini map is flat, so the dot sits on the station.
  if (next.id === "transit-station-raised" && next.type === "circle") next.paint = { ...next.paint, "circle-translate": [0, 0] };
  return next;
}

/**
 * A lightweight north-up style for the mini map, cut from the main map's
 * already-loaded style: land, water, parks, streets, flat building footprints,
 * subway lines and stations. No labels, no extrusion, no analytics. Pure.
 */
export function miniStyle(full: StyleSpecification): StyleSpecification {
  const layers = (full.layers ?? []).filter((l) => keepInMini(l as never)).map((l) => miniLayer(l));
  const used = new Set(layers.map((l) => (l as { source?: string }).source).filter(Boolean) as string[]);
  const sources = Object.fromEntries(Object.entries(full.sources ?? {}).filter(([id]) => used.has(id)));
  return {
    version: 8,
    sprite: full.sprite,
    glyphs: full.glyphs,
    sources,
    layers,
  };
}

/** CSS rotation for the heading cone on a north-up map: the camera yaw in degrees. Pure. */
export function coneRotation(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

const FACING = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"] as const;

/** Compass phrase for the street-view inset. Pure. */
export function facingLabel(bearing: number): string {
  const deg = ((bearing % 360) + 360) % 360;
  return `Facing ${FACING[Math.round(deg / 45) % 8]}`;
}
