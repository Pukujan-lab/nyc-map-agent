import { useSyncExternalStore } from "react";

/**
 * Who drives the camera, as one value. Street walking and 2D guidance used to be
 * separate booleans in three places, so a view picked from Change view could be
 * undone by whichever one still thought it owned the camera. Every change goes
 * through `nextCameraMode`, so two owners can never both be on.
 * Memory only; nothing is written to storage here.
 */
export type CameraMode =
  /** You pan the map: Top, Aerial, Closer or wherever you left it. */
  | { kind: "map" }
  /** Eye-level walk. `back` is where leaving returns to; guidance resumes there. */
  | { kind: "street"; target: (StreetTarget & { nonce: number }) | null; back: "map" | "guide" }
  /**
   * 2D guidance from your location. `centred` keeps you in the middle until you pan;
   * `tilt` frames you close (top-down, north up) until you pick a view yourself.
   */
  | { kind: "guide"; centred: boolean; tilt: boolean };

/**
 * Where to stand. `heading` faces that way instead of along the nearest street;
 * `exact` stands right there instead of snapping to the middle of the street
 * (going back to a spot you already stood on).
 */
export interface StreetTarget { lon: number; lat: number; heading?: number; exact?: boolean }

export type CameraEvent =
  | { type: "street"; target?: StreetTarget | null }
  | { type: "leave-street" }
  /** Top, Aerial, Closer or north-up: a view you chose. */
  | { type: "view" }
  | { type: "reset" }
  | { type: "guide" }
  | { type: "stop-guide" }
  | { type: "pan" }
  | { type: "recenter" };

export const INITIAL_CAMERA: CameraMode = { kind: "map" };
const MAP: CameraMode = INITIAL_CAMERA;

/** The one place camera modes change. Pure, for tests. */
export function nextCameraMode(mode: CameraMode, event: CameraEvent, now = Date.now()): CameraMode {
  switch (event.type) {
    case "street":
      return {
        kind: "street",
        // A stale target would drag the camera back to the last block walked.
        target: event.target ? { ...event.target, nonce: now } : null,
        back: mode.kind === "guide" || (mode.kind === "street" && mode.back === "guide") ? "guide" : "map",
      };
    case "leave-street":
      if (mode.kind !== "street") return mode;
      return mode.back === "guide" ? { kind: "guide", centred: true, tilt: true } : MAP;
    case "view":
      // Guidance keeps following you, but the view you picked stays.
      if (mode.kind === "guide") return mode.tilt ? { ...mode, tilt: false } : mode;
      if (mode.kind === "street" && mode.back === "guide") return { kind: "guide", centred: true, tilt: false };
      return mode.kind === "map" ? mode : MAP;
    case "reset":
      // The whole city: guidance stays on, but stops pulling the camera back to you.
      if (mode.kind === "guide" || (mode.kind === "street" && mode.back === "guide")) return { kind: "guide", centred: false, tilt: false };
      return mode.kind === "map" ? mode : MAP;
    case "guide":
      return { kind: "guide", centred: true, tilt: true };
    case "stop-guide":
      if (mode.kind === "guide") return MAP;
      if (mode.kind === "street" && mode.back === "guide") return { ...mode, back: "map" };
      return mode;
    case "pan":
      return mode.kind === "guide" && mode.centred ? { ...mode, centred: false } : mode;
    case "recenter":
      return mode.kind === "guide" && !mode.centred ? { ...mode, centred: true } : mode;
  }
}

let current: CameraMode = INITIAL_CAMERA;
const subs = new Set<() => void>();

export function sendCamera(event: CameraEvent): void {
  const next = nextCameraMode(current, event);
  if (next === current) return;
  current = next;
  subs.forEach((f) => f());
}

export function getCameraMode(): CameraMode {
  return current;
}

export function useCameraMode(): CameraMode {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
    () => INITIAL_CAMERA,
  );
}

/** Test-only: start each test from the city view. */
export function resetCameraModeForTests(): void {
  current = INITIAL_CAMERA;
}
