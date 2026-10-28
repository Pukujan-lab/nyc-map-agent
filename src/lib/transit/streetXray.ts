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

/** Street view sees through the ground only this far ahead, in metres. */
export const STREET_XRAY_M = 150;
/** Half the street view's see-through cone, in degrees either side of where the camera looks. */
export const STREET_XRAY_HALF_DEG = 50;
/** Close enough that it shows whichever way you face (the track right under you). */
const STREET_XRAY_NEAR_M = 30;

/**
 * Whether an underground train at `lon, lat` shows through the ground in street
 * view: within STREET_XRAY_M and inside the cone you look along, or right under you.
 * The whole city's tunnels glowing through every building read as noise.
 */
export function inStreetXray(eye: { lon: number; lat: number }, bearingDeg: number, lon: number, lat: number): boolean {
  const kx = 111_320 * Math.cos((eye.lat * Math.PI) / 180);
  const dx = (lon - eye.lon) * kx;
  const dy = (lat - eye.lat) * 111_320;
  const d = Math.hypot(dx, dy);
  if (d <= STREET_XRAY_NEAR_M) return true;
  if (d > STREET_XRAY_M) return false;
  const to = (Math.atan2(dx, dy) * 180) / Math.PI;
  const off = Math.abs((((to - bearingDeg) % 360) + 540) % 360 - 180);
  return off <= STREET_XRAY_HALF_DEG;
}

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
