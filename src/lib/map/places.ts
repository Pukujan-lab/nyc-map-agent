import { useSyncExternalStore } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Basemap place icons (shops, cafés, museums…) are hidden by default so the
 * map is not covered in icons. The person turns them back on from the
 * labelled Places control; the choice is saved in localStorage.
 */
export const PLACES_KEY = "nma.places";
export const POI_LAYERS = /^poi_r\d+$/;

export function readPlaces(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): boolean {
  try {
    return storage?.getItem(PLACES_KEY) === "on";
  } catch {
    return false;
  }
}

let shown = readPlaces();
const listeners = new Set<() => void>();
export function setPlacesShown(on: boolean): void {
  shown = on;
  try {
    if (on) localStorage.setItem(PLACES_KEY, "on");
    else localStorage.removeItem(PLACES_KEY);
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}
export function usePlacesShown(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => shown, () => shown);
}

export function applyPlaces(map: MapLibreMap, on: boolean): void {
  for (const l of map.getStyle()?.layers ?? []) {
    if (POI_LAYERS.test(l.id)) map.setLayoutProperty(l.id, "visibility", on ? "visible" : "none");
  }
}
