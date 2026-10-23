/** Pure helpers for compass heading: no DOM, no timers, easy to test. */

/** Above this many metres of GPS error the arrow is drawn in 2D only. */
export const MAX_AR_ACCURACY_M = 25;

export function normalizeDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** Signed shortest turn from a to b, in (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = normalizeDeg(b - a);
  return d > 180 ? d - 360 : d;
}

/**
 * Exponential smoothing on the circle (so 359 -> 1 goes through 0, not 180).
 * alpha in (0, 1]: 1 = no smoothing. The first reading passes through.
 */
export function smoothHeading(prev: number | null, next: number, alpha = 0.2): number {
  if (prev === null) return normalizeDeg(next);
  return normalizeDeg(prev + angleDiff(prev, next) * alpha);
}

export interface OrientationLike {
  alpha: number | null;
  absolute?: boolean;
  /** iOS Safari: degrees clockwise from magnetic north. */
  webkitCompassHeading?: number | null;
}

/**
 * Compass heading (degrees clockwise from north) or null when the event has no
 * usable absolute reading. iOS gives `webkitCompassHeading`; Android's
 * `deviceorientationabsolute` gives an absolute `alpha` that runs anticlockwise.
 * Assumes the phone is held upright in portrait; screen rotation is not handled.
 */
export function headingFromEvent(e: OrientationLike): number | null {
  const w = e.webkitCompassHeading;
  if (typeof w === "number" && Number.isFinite(w)) return normalizeDeg(w);
  if (e.absolute && typeof e.alpha === "number" && Number.isFinite(e.alpha)) return normalizeDeg(360 - e.alpha);
  return null;
}

/** Where the target lies relative to where the phone points: 0 = straight ahead, +90 = to the right. */
export function relativeBearing(targetBearing: number, heading: number): number {
  return angleDiff(heading, targetBearing);
}

/** Initial great-circle bearing from a to b, degrees clockwise from north. */
export function bearingTo(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const r = Math.PI / 180;
  const dLon = (b.lon - a.lon) * r;
  const y = Math.sin(dLon) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(dLon);
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

export function accuracyLine(accuracyM: number | null): string {
  return accuracyM === null ? "Location accuracy: waiting for a fix" : `Location accuracy: about ${Math.round(accuracyM)} m`;
}

export function accuracyTooLow(accuracyM: number | null): boolean {
  return accuracyM === null || accuracyM > MAX_AR_ACCURACY_M;
}
