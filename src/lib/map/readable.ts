import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Readable transit basemap: streets drawn plain and very pale, without their
 * darker casings, one-way arrows, shields or minor street names, so subway
 * and bus lines are what the eye finds first. Major street names stay, faint
 * but legible, for directions. Every change is a MapLibre paint or layout
 * property on the basemap's own layers; the originals are kept so turning it
 * off restores the style exactly.
 */
export const PALE_STREET = "#ffffff";
export const PALE_MAJOR = "#f1f1f1";
const FAINT_LABEL = "#8a8f98";

type Layer = { id: string; type: string; "source-layer"?: string };

const isRoadLine = (l: Layer) => l.type === "line" && l["source-layer"] === "transportation" && !/rail|hatching|pattern/.test(l.id);
const isCasing = (l: Layer) => isRoadLine(l) && /casing/.test(l.id);
const HIDE = /^(highway-name-(minor|path)|road_one_way_arrow|highway-shield|road_shield)/;
const MAJOR_LABEL = "highway-name-major";

/** What readable mode changes on one layer, or null to leave it alone. Pure, for tests. */
export function readableChange(l: Layer): { visibility?: "none"; color?: string; textColor?: string } | null {
  if (isCasing(l)) return { visibility: "none" };
  if (isRoadLine(l)) return { color: /motorway|trunk|primary|secondary/.test(l.id) ? PALE_MAJOR : PALE_STREET };
  if (l.type === "symbol" && HIDE.test(l.id)) return { visibility: "none" };
  if (l.id === MAJOR_LABEL) return { textColor: FAINT_LABEL };
  return null;
}

const saved = new WeakMap<MapLibreMap, Map<string, { visibility: unknown; color: unknown; textColor: unknown }>>();

export function applyReadable(map: MapLibreMap, on: boolean): void {
  const layers = (map.getStyle()?.layers ?? []) as Layer[];
  let store = saved.get(map);
  if (!store) { store = new Map<string, { visibility: unknown; color: unknown; textColor: unknown }>(); saved.set(map, store); }
  for (const l of layers) {
    const change = readableChange(l);
    if (!change) continue;
    if (on && !store.has(l.id)) {
      store.set(l.id, {
        visibility: map.getLayoutProperty(l.id, "visibility"),
        color: l.type === "line" ? map.getPaintProperty(l.id, "line-color") : undefined,
        textColor: l.type === "symbol" ? map.getPaintProperty(l.id, "text-color") : undefined,
      });
    }
    const orig = store.get(l.id);
    if (change.visibility) map.setLayoutProperty(l.id, "visibility", on ? "none" : (orig?.visibility ?? "visible"));
    if (change.color) map.setPaintProperty(l.id, "line-color", on ? change.color : orig?.color);
    if (change.textColor) map.setPaintProperty(l.id, "text-color", on ? change.textColor : orig?.textColor);
    if (!on) store.delete(l.id);
  }
}
