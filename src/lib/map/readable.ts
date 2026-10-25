import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Readable transit basemap: streets drawn plain and very pale, without their
 * darker casings, one-way arrows, shields or minor street names, so subway
 * and bus lines are what the eye finds first. Major street names stay, faint
 * but legible, for directions. "off" hides the road paint and the road names
 * and leaves rail, water and parks. Every change is a MapLibre paint or layout
 * property on the basemap's own layers; the originals are kept so another
 * look restores the style exactly.
 */
export const PALE_STREET = "#ffffff";
export const PALE_MAJOR = "#f1f1f1";
const FAINT_LABEL = "#8a8f98";

type Layer = { id: string; type: string; "source-layer"?: string };

const isRoadLine = (l: Layer) => l.type === "line" && l["source-layer"] === "transportation" && !/rail|hatching|pattern/.test(l.id);
const isCasing = (l: Layer) => isRoadLine(l) && /casing/.test(l.id);
const HIDE = /^(highway-name-(minor|path)|road_one_way_arrow|highway-shield|road_shield)/;
/** Highway number signs (278, GCP, BP…): hidden in every look, they read as clutter over the train lines (owner, 2026-10-24). */
const SHIELD = /^(highway-shield|road_shield)/;
const MAJOR_LABEL = "highway-name-major";
const ROAD_LABEL = /^(highway-|road_)/;

/** Road paint and road names. Rail stays, so the transit drawing is the only change. */
export function isRoadLayer(l: Layer): boolean {
  if (/rail|hatching/.test(l.id)) return false;
  if (l["source-layer"] === "transportation" && (l.type === "line" || l.type === "fill")) return true;
  return l.type === "symbol" && ROAD_LABEL.test(l.id);
}

/** What readable mode changes on one layer, or null to leave it alone. Pure, for tests. */
export function readableChange(l: Layer, look: StreetLook = "simple"): { visibility?: "none"; color?: string; textColor?: string } | null {
  if (l.type === "symbol" && SHIELD.test(l.id)) return { visibility: "none" };
  if (look === "full") return null;
  if (look === "off") return isRoadLayer(l) ? { visibility: "none" } : null;
  if (isCasing(l)) return { visibility: "none" };
  if (isRoadLine(l)) return { color: /motorway|trunk|primary|secondary/.test(l.id) ? PALE_MAJOR : PALE_STREET };
  if (l.type === "symbol" && HIDE.test(l.id)) return { visibility: "none" };
  if (l.id === MAJOR_LABEL) return { textColor: FAINT_LABEL };
  return null;
}

/** Hide the highway number signs again after a restyle put them back. */
export function hideShields(map: MapLibreMap): void {
  for (const l of (map.getStyle()?.layers ?? []) as Layer[]) {
    if (l.type === "symbol" && SHIELD.test(l.id) && map.getLayoutProperty(l.id, "visibility") !== "none") map.setLayoutProperty(l.id, "visibility", "none");
  }
}

const saved = new WeakMap<MapLibreMap, Map<string, { visibility: unknown; color: unknown; textColor: unknown }>>();

export interface ReadableColors { street: string; major: string; label: string }

export type StreetLook = "full" | "simple" | "off";

export function applyReadable(map: MapLibreMap, look: StreetLook, colors: ReadableColors = { street: PALE_STREET, major: PALE_MAJOR, label: FAINT_LABEL }): void {
  const layers = (map.getStyle()?.layers ?? []) as Layer[];
  let store = saved.get(map);
  if (!store) { store = new Map<string, { visibility: unknown; color: unknown; textColor: unknown }>(); saved.set(map, store); }
  for (const l of layers) {
    const change = readableChange(l, look);
    if (!change) {
      const orig = store.get(l.id);
      if (!orig) continue;
      map.setLayoutProperty(l.id, "visibility", orig.visibility ?? "visible");
      if (l.type === "line" && orig.color !== undefined) map.setPaintProperty(l.id, "line-color", orig.color);
      if (l.type === "symbol" && orig.textColor !== undefined) map.setPaintProperty(l.id, "text-color", orig.textColor);
      store.delete(l.id);
      continue;
    }
    if (!store.has(l.id)) {
      store.set(l.id, {
        visibility: map.getLayoutProperty(l.id, "visibility"),
        color: l.type === "line" ? map.getPaintProperty(l.id, "line-color") : undefined,
        textColor: l.type === "symbol" ? map.getPaintProperty(l.id, "text-color") : undefined,
      });
    }
    const orig = store.get(l.id);
    map.setLayoutProperty(l.id, "visibility", change.visibility ?? orig?.visibility ?? "visible");
    if (l.type === "line") {
      const color = change.color ? (change.color === PALE_MAJOR ? colors.major : colors.street) : orig?.color;
      if (color !== undefined) map.setPaintProperty(l.id, "line-color", color);
    }
    if (l.type === "symbol") {
      const textColor = change.textColor ? colors.label : orig?.textColor;
      if (textColor !== undefined) map.setPaintProperty(l.id, "text-color", textColor);
    }
  }
}
