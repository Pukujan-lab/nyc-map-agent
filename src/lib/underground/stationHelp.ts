import { useSyncExternalStore } from "react";

/**
 * Opens underground help's station view (exits and the walk out). The
 * underground feature registers it while it is mounted, so the home's Find
 * exit button can open it without importing that feature.
 */
let open: (() => void) | null = null;
const subs = new Set<() => void>();

export function setStationHelp(fn: (() => void) | null): void {
  open = fn;
  subs.forEach((f) => f());
}

export function useStationHelp(): (() => void) | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => open, () => null);
}
