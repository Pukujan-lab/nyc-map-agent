/**
 * Permission state machine for Live View (Beta). Pure: the component feeds it
 * events and renders the result. Nothing is requested until `request`.
 */
export type SensorState = "idle" | "requesting" | "granted" | "denied" | "unsupported";

export interface PermissionState {
  camera: SensorState;
  orientation: SensorState;
}

export type PermissionEvent =
  | { type: "request"; cameraSupported: boolean; orientationSupported: boolean }
  | { type: "camera"; result: "granted" | "denied" | "unsupported" }
  | { type: "orientation"; result: "granted" | "denied" | "unsupported" }
  | { type: "stop" };

export const initialPermissions: PermissionState = { camera: "idle", orientation: "idle" };

export function permissionReducer(s: PermissionState, e: PermissionEvent): PermissionState {
  switch (e.type) {
    case "request":
      return {
        camera: e.cameraSupported ? "requesting" : "unsupported",
        orientation: e.orientationSupported ? "requesting" : "unsupported",
      };
    case "camera":
      return s.camera === "requesting" ? { ...s, camera: e.result } : s;
    case "orientation":
      return s.orientation === "requesting" ? { ...s, orientation: e.result } : s;
    case "stop":
      return initialPermissions;
  }
}

export type LiveViewMode = "idle" | "requesting" | "ar" | "fallback";

/** "ar" needs both sensors; any missing one means the 2D arrow, never a broken view. */
export function modeOf(s: PermissionState): LiveViewMode {
  if (s.camera === "idle" && s.orientation === "idle") return "idle";
  if (s.camera === "requesting" || s.orientation === "requesting") return "requesting";
  return s.camera === "granted" && s.orientation === "granted" ? "ar" : "fallback";
}

export function fallbackReason(s: PermissionState): string | null {
  if (modeOf(s) !== "fallback") return null;
  if (s.camera === "denied") return "Camera permission was declined.";
  if (s.camera === "unsupported") return "This browser has no camera access.";
  if (s.orientation === "denied") return "Motion and compass permission was declined.";
  return "This device has no compass.";
}
