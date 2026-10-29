import { useSyncExternalStore } from "react";

/**
 * Whether the basemap's first tiles have arrived. On a slow phone the two citywide
 * tiles share the connection with the subway file and the area shapes, and the
 * map stays blank until they land. Data that draws on top of the map waits for
 * this, so the map shows first; the fallback keeps that data coming even when the
 * map never reports (no WebGL, the tile server down).
 */
export const BASEMAP_WAIT_MS = 8_000;

let ready = false;
const listeners = new Set<() => void>();

export function markBasemapReady(): void {
  if (ready) return;
  ready = true;
  listeners.forEach((l) => l());
}

export function basemapReady(): boolean {
  return ready;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useBasemapReady(): boolean {
  return useSyncExternalStore(subscribe, basemapReady, basemapReady);
}

if (typeof window !== "undefined") window.setTimeout(markBasemapReady, BASEMAP_WAIT_MS);

/** Test only. */
export function resetBasemapReady(): void {
  ready = false;
}
