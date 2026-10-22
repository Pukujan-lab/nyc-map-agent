import { useSyncExternalStore } from "react";

/** Which vehicle the camera is locked to (null = not following). Shared by the map layer and the panel. */
let followed: string | null = null;
const subs = new Set<() => void>();
/** The map camera from just before follow started. Stop following eases back to it. */
export type FollowSnap = { center: [number, number]; zoom: number; bearing: number; pitch: number };
let snap: FollowSnap | null = null;
let restoreOnStop = false;

export function setFollowed(key: string | null) {
  // Drag and Esc release the camera where it is. The Stop button sets the flag first.
  if (key === null && !restoreOnStop) snap = null;
  followed = key;
  subs.forEach((f) => f());
}

/** Keep the first view. A later train tap must not overwrite it with the chase camera. */
export function rememberFollowOrigin(cam: FollowSnap) {
  if (!snap) snap = cam;
}

/** The Stop following button: release the vehicle and ask the map to ease back. */
export function stopFollowing() {
  if (followed === null) return;
  restoreOnStop = true;
  setFollowed(null);
}

/** Read once, on the render where follow has just ended. */
export function takeFollowRestore(): { restore: boolean; cam: FollowSnap | null } {
  const restore = restoreOnStop;
  const cam = restore ? snap : null;
  restoreOnStop = false;
  snap = null;
  return { restore, cam };
}

export function useFollowed(): string | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => followed);
}
/** Non-hook read, for one-off snapshots such as the Ask context. */
export const followedTrain = (): string | null => followed;

/** Follow camera: behind, beside, above, or in the train's cab. */
export type FollowMode = "chase" | "side" | "overhead" | "cab";
let mode: FollowMode = "chase";
const modeSubs = new Set<() => void>();
export function setFollowMode(m: FollowMode) {
  mode = m;
  modeSubs.forEach((f) => f());
}
export function useFollowMode(): FollowMode {
  return useSyncExternalStore((f) => (modeSubs.add(f), () => modeSubs.delete(f)), () => mode);
}

/**
 * Camera eye and look-at (metres east/north of the vehicle, and height) for a
 * follow mode; `bearing` is the vehicle's heading in degrees, `z` its height.
 */
export function followRig(m: FollowMode, bearing: number, z: number): { eye: [number, number, number]; look: [number, number, number] } {
  const r = (bearing * Math.PI) / 180, fx = Math.sin(r), fy = Math.cos(r); // forward
  const rx = fy, ry = -fx; // right-hand side
  const at = Math.max(z, 0);
  switch (m) {
    case "side": return { eye: [rx * 70, ry * 70, at + 18], look: [0, 0, at] };
    case "overhead": return { eye: [-fx * 20, -fy * 20, at + 320], look: [0, 0, at] };
    case "cab": return { eye: [fx * 9, fy * 9, at + 3.2], look: [fx * 120, fy * 120, at + 2] };
    default: return { eye: [-fx * 70, -fy * 70, at + 28], look: [fx * 20, fy * 20, at] };
  }
}
