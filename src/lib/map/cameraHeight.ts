import { EYE_HEIGHT_M } from "./walk";

/**
 * The camera-height control: one slider from a pedestrian's eye (1.7 m, the
 * street-level walk) to an overhead view. Height runs on a log scale so the
 * low, interesting end gets most of the travel; the tilt eases from nearly
 * level just above the street to straight down at the top.
 */
export const MIN_HEIGHT_M = EYE_HEIGHT_M;
export const MAX_HEIGHT_M = 3000;
/** Below this the slider hands over to the street-level walk. */
export const STREET_LEVEL_M = 2.5;
const MAX_TILT = 80;

/** Slider position 0..100 → metres. */
export function heightFromSlider(t: number): number {
  const k = Math.min(100, Math.max(0, t)) / 100;
  return MIN_HEIGHT_M * (MAX_HEIGHT_M / MIN_HEIGHT_M) ** k;
}

/** Metres → slider position 0..100. */
export function sliderFromHeight(m: number): number {
  const h = Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, m));
  return (100 * Math.log(h / MIN_HEIGHT_M)) / Math.log(MAX_HEIGHT_M / MIN_HEIGHT_M);
}

/** Tilt for a camera height: ~80° just above the street, 0° (overhead) at the top. */
export function pitchForHeight(m: number): number {
  return MAX_TILT * (1 - sliderFromHeight(m) / 100);
}

export function formatHeight(m: number): string {
  if (m < 10) return `${m.toFixed(1)} m`;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
