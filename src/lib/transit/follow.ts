import { useSyncExternalStore } from "react";

/** Which vehicle the camera is locked to (null = not following). Shared by the map layer and the panel. */
let followed: string | null = null;
const subs = new Set<() => void>();
export function setFollowed(key: string | null) {
  followed = key;
  subs.forEach((f) => f());
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
