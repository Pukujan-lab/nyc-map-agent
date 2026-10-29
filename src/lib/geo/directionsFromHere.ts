import { sharedCoords } from "@/lib/geo/sharedLocation";
import { walkEye } from "@/lib/map/walkEye";
import { metresBetween } from "@/lib/map/walk";

export interface LngLat {
  lon: number;
  lat: number;
}

/**
 * Where directions should start: the street-view eye while walking, otherwise
 * the position shared from My location. Null until one of those exists.
 */
export function currentOrigin(): LngLat | null {
  const eye = walkEye();
  if (eye) return { lon: eye.lon, lat: eye.lat };
  return sharedCoords();
}

/** Both ends, or null when there is no current location to start from. */
export function directionsPair(origin: LngLat | null, dest: LngLat): { start: LngLat; end: LngLat } | null {
  if (!origin) return null;
  return { start: origin, end: dest };
}

/**
 * "Directions from here" asks the trip planner in chat (owner, 2026-10-26):
 * "How do I get to Rockefeller Center (40.75874, -73.97870)?", the name to read and the exact spot to plan to.
 */
export function directionsQuestion(dest: LngLat, label?: string): string {
  return `How do I get to ${label?.trim() || "this spot"} (${dest.lat.toFixed(5)}, ${dest.lon.toFixed(5)})?`;
}

/** Closer than this, Directions from here draws the walk; farther, or with no location yet, it asks the planner. */
export const WALK_ONLY_M = 800;
export function walkOnly(origin: LngLat | null, dest: LngLat): boolean {
  return !!origin && metresBetween([origin.lon, origin.lat], [dest.lon, dest.lat]) < WALK_ONLY_M;
}
