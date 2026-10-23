/**
 * Tap targets for 3D street furniture (restroom kiosks), registered by the
 * three.js layer and hit-tested here in screen space without three.js, so the
 * click handlers can stay in the main chunk and in the feature modules.
 */
import type { Map as MapLibreMap } from "maplibre-gl";

export interface PickTarget {
  kind: "restroom" | "place";
  id: string;
  lng: number;
  lat: number;
  /** Height of the model, metres. */
  h: number;
  props: Record<string, unknown>;
}

const EYE_M = 1.7;

/**
 * Where the viewer stands: the camera's ground point. At eye level the map
 * centre sits far down the look ray, so anything "near the centre" is
 * hundreds of metres ahead; overhead the two coincide.
 */
export function eyeOrCenter(map: MapLibreMap): { lng: number; lat: number } {
  try {
    const t = (map as unknown as { transform?: { getCameraLngLat?: () => { lng: number; lat: number } } }).transform;
    const p = t?.getCameraLngLat?.();
    if (p && Number.isFinite(p.lng) && Number.isFinite(p.lat)) return { lng: p.lng, lat: p.lat };
  } catch {
    /* fall through */
  }
  const c = map.getCenter();
  return { lng: c.lng, lat: c.lat };
}
let targets: PickTarget[] = [];

export function setPickTargets(t: PickTarget[]): void {
  targets = t;
}

/**
 * The model under a screen point. A model `h` metres tall standing on the
 * ground spans from its base up to (h - eye) / eye of the base's depth below
 * the horizon, above the horizon.
 */
export function pickAt(map: MapLibreMap, x: number, y: number): PickTarget | null {
  if (!targets.length) return null;
  const c = map.getCenter();
  const b = (map.getBearing() * Math.PI) / 180;
  const far = { lng: c.lng + (Math.sin(b) * 3000) / (111_320 * Math.cos((c.lat * Math.PI) / 180)), lat: c.lat + (Math.cos(b) * 3000) / 111_320 };
  const hy = map.project([far.lng, far.lat]).y;
  let best: PickTarget | null = null;
  let bestDepth = -Infinity;
  for (const t of targets) {
    const p = map.project([t.lng, t.lat]);
    const depth = p.y - hy;
    if (depth <= 0) continue; // behind or beyond the horizon
    const top = hy - (depth * (t.h - EYE_M)) / EYE_M;
    const half = Math.max(18, (depth * 0.5) / EYE_M);
    if (y < top - 6 || y > p.y + 6 || Math.abs(x - p.x) > half) continue;
    if (depth > bestDepth) {
      bestDepth = depth; // nearest (lowest on screen) wins
      best = t;
    }
  }
  return best;
}

/** Which restroom sets get 3D kiosks: mirrors the Restrooms toggle and its "Include shops & cafés" chip. */
export const kioskSources = { restrooms: true, places: false };

/** Street-level bus-stop poles. The Layers switch writes this; the furniture layer reads it. */
let busStopsOn = true;
const busStopListeners = new Set<() => void>();

export function busStopsShown(): boolean {
  return busStopsOn;
}

export function setBusStopsShown(on: boolean): void {
  if (busStopsOn === on) return;
  busStopsOn = on;
  for (const listener of busStopListeners) listener();
}

export function subscribeBusStops(listener: () => void): () => void {
  busStopListeners.add(listener);
  return () => busStopListeners.delete(listener);
}
