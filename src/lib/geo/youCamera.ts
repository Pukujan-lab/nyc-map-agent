import { useSyncExternalStore } from "react";

/**
 * What the camera does with your marker, cycled by Center on my location the
 * way Google and Apple Maps do it:
 * - "off": the map stays where you put it;
 * - "follow": the map keeps you in the middle, north up;
 * - "turn": it also turns so the way you face is up.
 * Any other camera move (a drag, an answer framing a place) sets it back to "off".
 */
export type YouCamera = "off" | "follow" | "turn";

let mode: YouCamera = "off";
const listeners = new Set<() => void>();

export function setYouCamera(next: YouCamera): void {
  if (next === mode) return;
  mode = next;
  listeners.forEach((l) => l());
}

export function youCamera(): YouCamera {
  return mode;
}

/** The next mode for a tap on Center on my location: off → follow → turn → follow. */
export function nextYouCamera(current: YouCamera, canTurn: boolean): YouCamera {
  if (current === "follow") return canTurn ? "turn" : "follow";
  return "follow";
}

export function useYouCamera(): YouCamera {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => mode,
    () => mode,
  );
}

/** Tag on camera moves the marker makes itself, so they do not switch following off. */
export const YOU_MOVE = { youMove: true } as const;
