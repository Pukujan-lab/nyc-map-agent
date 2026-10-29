/**
 * Which way the phone faces, for the arrow on your dot. Pure: the hook in
 * useHeading.ts feeds it sensor readings and GPS fixes and draws the result.
 *
 * - The compass is believed only once it is calibrated: iOS reports an
 *   accuracy in degrees (negative means uncalibrated); Android reports none,
 *   so the phone must first have turned through CALIBRATED_SWEEP_DEG.
 * - Until then, or when iOS says the accuracy is poor, `calibrate` asks for
 *   the figure 8.
 * - Readings are smoothed on the circle, gently for small wobbles and faster
 *   for a real turn, so the arrow neither jitters nor lags.
 * - Without a compass, the heading comes from walking (two GPS fixes far
 *   enough apart).
 * - Street lock: steel, grates and passing trains bend the compass by a steady
 *   amount. When walking keeps disagreeing with it by about the same angle,
 *   that angle becomes an offset added to every compass reading, so the
 *   compass is right again once you stop, with no figure 8.
 * - Coming up a subway stair: the stair's mapped way up says which way you face,
 *   and calibrates the compass the same way.
 */

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

/** Small wobbles barely move the arrow; a real turn catches up within a few readings. */
export function adaptiveAlpha(turnDeg: number): number {
  const d = Math.abs(turnDeg);
  if (d < 4) return 0.08;
  if (d >= 30) return 0.5;
  return 0.25;
}

export interface OrientationLike {
  alpha: number | null;
  absolute?: boolean;
  /** iOS Safari: degrees clockwise from magnetic north. */
  webkitCompassHeading?: number | null;
  /** iOS Safari: ± degrees of error; negative when the compass is uncalibrated. */
  webkitCompassAccuracy?: number | null;
}

/**
 * Compass heading (degrees clockwise from north) or null when the event has no
 * usable absolute reading. iOS gives `webkitCompassHeading`; Android's
 * `deviceorientationabsolute` gives an absolute `alpha` that runs anticlockwise.
 * Assumes the phone is held in portrait; screen rotation is not handled.
 */
export function headingFromEvent(e: OrientationLike): number | null {
  const w = e.webkitCompassHeading;
  if (typeof w === "number" && Number.isFinite(w)) return normalizeDeg(w);
  if (e.absolute && typeof e.alpha === "number" && Number.isFinite(e.alpha)) return normalizeDeg(360 - e.alpha);
  return null;
}

/** iOS accuracy in degrees, or null when the browser gives none (Android). */
export function accuracyFromEvent(e: OrientationLike): number | null {
  const a = e.webkitCompassAccuracy;
  return typeof a === "number" && Number.isFinite(a) ? a : null;
}

/** Worse than this many degrees and the arrow asks for a figure 8. */
export const POOR_ACCURACY_DEG = 30;
/** Without an accuracy figure, the phone must have turned this far before the compass is trusted. */
export const CALIBRATED_SWEEP_DEG = 60;
/** GPS fixes this far apart give a walking heading. */
export const MOVE_MIN_M = 8;

export type HeadingSource = "compass" | "movement" | "stair" | "none";

/** Walking samples that must agree before the street lock corrects the compass. */
export const LOCK_SAMPLES = 4;
/** How far those samples may scatter (degrees) and still count as one steady error. */
export const LOCK_SCATTER_DEG = 20;

export interface HeadingState {
  /** Smoothed degrees clockwise from north, or null when nothing is known yet. */
  heading: number | null;
  source: HeadingSource;
  /** Show the "move your phone in a figure 8" hint. */
  calibrate: boolean;
  /** Degrees the raw compass has turned through so far (for phones without an accuracy figure). */
  sweptDeg: number;
  lastRaw: number | null;
  /** The phone sent compass readings at some point; walking then never overrides it. */
  hasCompass: boolean;
  /** Learned correction added to raw compass readings (street lock or stair), or null. */
  offset: number | null;
  /** Recent compass-vs-walking differences, newest last, toward the street lock. */
  pending: number[];
}

export type HeadingEvent =
  | { type: "compass"; heading: number; accuracyDeg: number | null }
  /** `learn: false` keeps the street lock out of it (a train ride, or vague GPS). */
  | { type: "move"; heading: number; learn?: boolean }
  | { type: "stair"; heading: number }
  | { type: "reset" };

export const initialHeading: HeadingState = { heading: null, source: "none", calibrate: false, sweptDeg: 0, lastRaw: null, hasCompass: false, offset: null, pending: [] };

/** The steady compass error in these differences, or null while they still scatter. */
export function steadyOffset(diffs: number[]): number | null {
  if (diffs.length < LOCK_SAMPLES) return null;
  const recent = diffs.slice(-LOCK_SAMPLES);
  const mean = recent.reduce((m, d, i) => (i === 0 ? d : m + angleDiff(m, d) / (i + 1)), 0);
  return recent.every((d) => Math.abs(angleDiff(mean, d)) <= LOCK_SCATTER_DEG) ? Math.round(angleDiff(0, mean)) : null;
}

/**
 * How wide the facing cone should open (degrees), from how sure the heading is;
 * null when there is no heading. A wide cone is honest; a narrow wrong one sends people astray.
 */
export function headingSpread(s: HeadingState): number | null {
  if (s.heading === null) return null;
  if (s.source === "compass") return s.offset !== null ? 20 : s.calibrate ? 70 : 30;
  if (s.source === "stair") return 40;
  return 35;
}

/** True when the compass reading should not be trusted yet. */
export function needsCalibration(accuracyDeg: number | null, sweptDeg: number): boolean {
  if (accuracyDeg !== null) return accuracyDeg < 0 || accuracyDeg > POOR_ACCURACY_DEG;
  return sweptDeg < CALIBRATED_SWEEP_DEG;
}

export function headingReducer(s: HeadingState, e: HeadingEvent): HeadingState {
  switch (e.type) {
    case "compass": {
      const raw = normalizeDeg(e.heading);
      if (s.offset !== null) {
        // Street-locked: the learned offset stands in for calibration.
        const prev = s.source === "compass" ? s.heading : null;
        const fixed = normalizeDeg(raw + s.offset);
        const heading = smoothHeading(prev, fixed, prev === null ? 1 : adaptiveAlpha(angleDiff(prev, fixed)));
        return { ...s, heading, source: "compass", calibrate: false, lastRaw: raw, hasCompass: true };
      }
      const sweptDeg = Math.min(360, s.sweptDeg + (s.lastRaw === null ? 0 : Math.abs(angleDiff(s.lastRaw, raw))));
      const calibrate = needsCalibration(e.accuracyDeg, sweptDeg);
      // While uncalibrated, a walking heading (if any) is the better guess; keep it.
      if (calibrate && s.source === "movement") return { ...s, calibrate, sweptDeg, lastRaw: raw, hasCompass: true };
      const prev = s.source === "compass" ? s.heading : null;
      const heading = smoothHeading(prev, raw, prev === null ? 1 : adaptiveAlpha(angleDiff(prev, raw)));
      return { ...s, heading, source: "compass", calibrate, sweptDeg, lastRaw: raw, hasCompass: true };
    }
    case "move": {
      // Street lock: walking that keeps disagreeing with the compass by one steady angle corrects it.
      if (s.hasCompass && s.lastRaw !== null && e.learn !== false) {
        const pending = [...s.pending, angleDiff(s.lastRaw, e.heading)].slice(-LOCK_SAMPLES);
        const offset = steadyOffset(pending);
        if (offset !== null) return { ...s, pending, offset, heading: normalizeDeg(s.lastRaw + offset), source: "compass", calibrate: false };
        s = { ...s, pending };
      }
      // A calibrated compass wins over walking; an uncalibrated one does not.
      if (s.hasCompass && s.source === "compass" && !s.calibrate) return s;
      const prev = s.source === "movement" ? s.heading : null;
      return { ...s, heading: smoothHeading(prev, e.heading, 0.5), source: "movement" };
    }
    case "stair": {
      // At the top of the stairs you face its way up; with a compass, that also calibrates it.
      const heading = normalizeDeg(e.heading);
      const offset = s.lastRaw !== null ? Math.round(angleDiff(s.lastRaw, heading)) : s.offset;
      return { ...s, heading, source: "stair", calibrate: false, offset, pending: [] };
    }
    case "reset":
      return initialHeading;
  }
}
