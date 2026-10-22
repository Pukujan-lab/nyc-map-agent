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
