import { sharedCoords } from "@/lib/geo/sharedLocation";
import { walkEye } from "@/lib/map/walkEye";

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
