import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * The one live MapLibre map, for feature modules that drive the camera or add
 * their own sources (they cannot reach MapView's ref). Set by MapView on load.
 */
let current: MapLibreMap | null = null;
const listeners = new Set<(map: MapLibreMap | null) => void>();

export function setMapInstance(map: MapLibreMap | null): void {
  current = map;
  listeners.forEach((l) => l(map));
}
export function getMapInstance(): MapLibreMap | null {
  return current;
}
export function onMapInstance(cb: (map: MapLibreMap | null) => void): () => void {
  listeners.add(cb);
  cb(current);
  return () => listeners.delete(cb);
}
