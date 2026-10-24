import { useSyncExternalStore } from "react";
import { setBusStopsShown } from "./streetPick";

/**
 * Map detail and transit-line choices from the Layers & filters drawer (#171),
 * shared by the map, the transit layer and the drawer. Saved in localStorage.
 */
export interface MapOptions {
  /** "simple" = pale streets without casings or minor names (the default). */
  streets: "simple" | "full";
  /** False hides the road paint and road names so the transit lines are the map. */
  roads: boolean;
  streetNames: boolean;
  /** "flat" = pale 2D footprints, no extrusion (the default); "3d" = extruded and textured. */
  buildings: "flat" | "3d";
  /** Subway routes picked in Transit lines; empty = all lines, muted. */
  routes: string[];
  stationsOnly: boolean;
  /** Basemap bus-stop icons on the overview; off by default. Street view always shows the poles. */
  busStops: boolean;
}
export const OPTIONS_KEY = "nma.mapOptions";
export const DEFAULT_OPTIONS: MapOptions = { streets: "simple", roads: true, streetNames: true, buildings: "flat", routes: [], stationsOnly: false, busStops: false };

export function readOptions(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): MapOptions {
  try {
    const raw = JSON.parse(storage?.getItem(OPTIONS_KEY) ?? "{}") as Partial<MapOptions>;
    return {
      streets: raw.streets === "full" ? "full" : "simple",
      roads: raw.roads !== false,
      streetNames: raw.streetNames !== false,
      buildings: raw.buildings === "3d" ? "3d" : "flat",
      routes: Array.isArray(raw.routes) ? raw.routes.filter((r): r is string => typeof r === "string") : [],
      stationsOnly: raw.stationsOnly === true,
      // Off unless switched on: bus-stop icons crowded the transit lines (owner, 2026-10-24).
      busStops: raw.busStops === true,
    };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

let options = readOptions();
// Street view always draws bus-stop poles (they are how you find your stop there);
// the Bus stops switch only covers the small icons on the overview map.
setBusStopsShown(true);
const listeners = new Set<() => void>();
export function setOptions(patch: Partial<MapOptions>): void {
  options = { ...options, ...patch };
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}
export function useMapOptions(): MapOptions {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => options, () => options);
}

/**
 * Subway line opacity: muted (desaturated against the pale map) until a line
 * is picked or Transit Focus is on; picked lines full, the rest faint.
 */
export function lineOpacity(routes: readonly string[], focus: boolean): unknown {
  if (routes.length) return ["case", ["in", ["get", "route"], ["literal", [...routes]]], 1, 0.12];
  return focus ? 1 : 0.5;
}

/** NYC subway services, in the order the MTA lists them. */
export const SUBWAY_ROUTES = ["1", "2", "3", "4", "5", "6", "7", "A", "C", "E", "B", "D", "F", "M", "G", "J", "Z", "L", "N", "Q", "R", "W", "S"];
