import { useSyncExternalStore } from "react";

/**
 * Opens underground help's station view (exits and the walk out). The
 * underground feature registers it while it is mounted, so the home's Find
 * exit button can open it without importing that feature.
 */
let open: ((stationId?: string) => void) | null = null;
const subs = new Set<() => void>();

export function setStationHelp(fn: ((stationId?: string) => void) | null): void {
  open = fn;
  subs.forEach((f) => f());
}

export function useStationHelp(): ((stationId?: string) => void) | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => open, () => null);
}

let visible = false;
const visibilitySubs = new Set<() => void>();
/** The agent hides its idle cards while station help owns the map. */
export function setStationHelpVisible(next: boolean): void {
  if (visible === next) return;
  visible = next;
  visibilitySubs.forEach((f) => f());
}
export function useStationHelpVisible(): boolean {
  return useSyncExternalStore((f) => (visibilitySubs.add(f), () => visibilitySubs.delete(f)), () => visible, () => false);
}
