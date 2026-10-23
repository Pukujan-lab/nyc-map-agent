import { useSyncExternalStore } from "react";

/**
 * Global X-ray: underground subway trains glow below a semi-transparent ground
 * and buildings, at every level (Street, Mid, Up, Top). Off by default; riding
 * an underground train turns it on.
 *
 * The see-through patch stays local. A tilted camera used to grow it to 6 km,
 * which darkened whole neighborhoods. Riders look at the tunnel beside them.
 */
/** Nearby see-through ground, in metres. Same size at every zoom. */
export const XRAY_VEIL_M = 250;

/** A disc of `radiusM` around a point, for the flat-map x-ray fill. */
export function xrayVeilDisc(lon: number, lat: number, radiusM = XRAY_VEIL_M): GeoJSON.FeatureCollection {
  const ring: [number, number][] = [];
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lon + (Math.cos(a) * radiusM) / kx, lat + (Math.sin(a) * radiusM) / 111_320]);
  }
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }],
  };
}
let on = false;
const subs = new Set<() => void>();

/**
 * X-ray follows the train you boarded. Underground turns it on, open track
 * turns it off, and stepping off (Stop following, drag, or Esc) turns it off.
 * Null leaves a manual choice alone, which is the case when nobody is riding.
 */
export function xrayForFollow(wasFollowing: boolean, following: boolean, underground: boolean | null): boolean | null {
  if (!following) return wasFollowing ? false : null;
  return underground;
}

export function setStreetXray(value: boolean) {
  if (on === value) return;
  on = value;
  subs.forEach((f) => f());
}
export const getStreetXray = () => on;
export function useStreetXray(): boolean {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => on);
}
