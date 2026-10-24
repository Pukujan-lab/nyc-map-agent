import { useSyncExternalStore } from "react";

/**
 * The street label underfoot while walking ("W 44 St at 8 Av"), published by
 * MapView so feature overlays can read it without importing MapView. Null when
 * not walking.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

export function setStreetHere(label: string | null): void {
  if (label === current) return;
  current = label;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useStreetHere(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
