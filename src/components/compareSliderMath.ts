/** Pure divider logic for CompareSlider (#191). No DOM, no React. */

export type CompareOrientation = "beside" | "under";

export const DIVIDER_MIN = 10;
export const DIVIDER_MAX = 90;
export const DIVIDER_DEFAULT = 50;
export const KEY_STEP = 5;
export const KEY_STEP_LARGE = 20;

/** Clamp a divider position (percent of the track) into [min, max]. Non-finite input falls back to the default. */
export function clampDivider(
  pct: number,
  min = DIVIDER_MIN,
  max = DIVIDER_MAX,
): number {
  if (!Number.isFinite(pct)) return DIVIDER_DEFAULT;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, pct));
}

/** Convert a pointer coordinate to a clamped percent along a track starting at `start` with length `size`. */
export function pointerToPercent(
  pointer: number,
  start: number,
  size: number,
  min = DIVIDER_MIN,
  max = DIVIDER_MAX,
): number {
  if (!(size > 0)) return DIVIDER_DEFAULT;
  return clampDivider(((pointer - start) / size) * 100, min, max);
}

/**
 * Keyboard nudging. "beside" splits left/right so Left/Right move it;
 * "under" splits top/bottom so Up/Down move it. Home/End jump to the limits.
 * Returns null for keys that do nothing.
 */
export function nudgeDivider(
  pct: number,
  key: string,
  orientation: CompareOrientation,
  large = false,
  min = DIVIDER_MIN,
  max = DIVIDER_MAX,
): number | null {
  const step = large ? KEY_STEP_LARGE : KEY_STEP;
  const back = orientation === "beside" ? "ArrowLeft" : "ArrowUp";
  const fwd = orientation === "beside" ? "ArrowRight" : "ArrowDown";
  if (key === back) return clampDivider(pct - step, min, max);
  if (key === fwd) return clampDivider(pct + step, min, max);
  if (key === "Home") return clampDivider(min, min, max);
  if (key === "End") return clampDivider(max, min, max);
  return null;
}

/** Choose a layout from the container width: narrow phones stack, wider panes sit side by side. */
export function orientationForWidth(width: number, breakpoint = 560): CompareOrientation {
  return width >= breakpoint ? "beside" : "under";
}
