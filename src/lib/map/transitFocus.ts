import { useSyncExternalStore } from "react";
import { mixHex } from "@/lib/theme";

/**
 * Transit Focus: a dim, grey veil drawn just under the transit layers, so the
 * street map and every layer below it fade while subway and bus lines,
 * stations and vehicles stay at full strength. Turning it off removes the
 * veil, which restores the map exactly. The choice is kept in localStorage.
 */
export const FOCUS_KEY = "nma.transitFocus";
export const FOCUS_VEIL_ID = "transit-focus-veil";
export const FOCUS_OPACITY = 0.6;

/**
 * The veil colour for a theme: a neutral grey a step darker than the land, so
 * Focus dims and desaturates the basemap and never washes it out (Ivory) or
 * lifts it (Ink, where it goes near-black). Pure.
 */
export function focusVeil(p: { land: string; dark: boolean }): string {
  return p.dark ? "#0A0A0A" : mixHex(p.land, "#8E8E8A", 0.4);
}

/** One polygon covering the whole Web Mercator world. */
export const WORLD: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] },
    },
  ],
};

export function readFocus(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): boolean {
  try {
    return storage?.getItem(FOCUS_KEY) === "1";
  } catch {
    return false;
  }
}

let focusOn = readFocus();
const listeners = new Set<() => void>();
function setFocusOn(on: boolean): void {
  focusOn = on;
  try {
    if (on) localStorage.setItem(FOCUS_KEY, "1");
    else localStorage.removeItem(FOCUS_KEY);
  } catch {
    /* private mode: the choice lasts for this visit only */
  }
  listeners.forEach((l) => l());
}

/** Shared by the transit layer (the veil) and the map (the readable basemap). */
export function useTransitFocus(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => focusOn,
    () => focusOn,
  );
  return [on, setFocusOn];
}

/** Clear all in the Layers & filters drawer turns Focus off too. */
export function setTransitFocusOff(): void {
  setFocusOn(false);
}
