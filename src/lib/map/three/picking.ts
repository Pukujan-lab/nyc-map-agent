/**
 * Picking: which hydrants, corner signs and storefront signboards are near a
 * point, read from the loaded city tiles (no three.js scene query needed).
 * Distances are MapLibre's ground metres; results are nearest first and
 * deduplicated across tile edges (a feature on a border is in both tiles).
 */
import type { GeoJSONFeature, Map as MaplibreMap } from "maplibre-gl";
import { distanceM } from "./projection";

type Querier = Pick<MaplibreMap, "querySourceFeatures" | "getSource" | "getCenter" | "getZoom">;
const SOURCE = "city3d";

/** Features of `sourceLayer` within `radius` m of (lng, lat), nearest first, one per `key`. */
function near<T>(
  map: Querier, sourceLayer: string, lng: number, lat: number, radius: number,
  pick: (f: GeoJSONFeature) => { x: number; y: number; key: string; item: T } | null,
  filter?: unknown,
): Array<T & { d: number }> {
  const seen = new Map<string, T & { d: number }>();
  const opts = filter ? { sourceLayer, filter } : { sourceLayer };
  for (const f of map.querySourceFeatures(SOURCE, opts as Parameters<MaplibreMap["querySourceFeatures"]>[1])) {
    const p = pick(f);
    if (!p) continue;
    const d = distanceM(lng, lat, p.x, p.y);
    if (d > radius) continue;
    if (!seen.has(p.key)) seen.set(p.key, { ...p.item, d });
  }
  return [...seen.values()].sort((a, b) => a.d - b.d);
}

// ---- Hydrants ----
export const HYDRANT_CAP = 400;
const HYDRANT_RADIUS_M = 350;
export const HYDRANT_MIN_ZOOM = 16;

/** One hydrant point: where it stands and which way its pumper nozzle faces (degrees). */
export interface HydrantInstance {
  lon: number;
  lat: number;
  facing: number;
}

/** Deterministic 0..360 from a position, so a hydrant keeps its facing between frames. */
export function hydrantFacing(lon: number, lat: number): number {
  const h = Math.sin(lon * 12_989.8 + lat * 78_233.1) * 43_758.5453;
  return Math.round((h - Math.floor(h)) * 4) * 90;
}

/** Hydrants near the map centre from the city tiles' `props` layer (kind = hydrant). */
export function nearbyHydrants(map: Querier): HydrantInstance[] {
  if (!map.getSource(SOURCE) || map.getZoom() < HYDRANT_MIN_ZOOM) return [];
  const { lng, lat } = map.getCenter();
  return near<HydrantInstance>(map, "props", lng, lat, HYDRANT_RADIUS_M, (f) => {
    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : undefined;
    if (!ring?.length) return null;
    let x = 0, y = 0;
    const n = ring.length - 1 || 1;
    for (let i = 0; i < n; i++) {
      x += ring[i][0];
      y += ring[i][1];
    }
    x /= n;
    y /= n;
    return { x, y, key: `${x.toFixed(6)},${y.toFixed(6)}`, item: { lon: x, lat: y, facing: hydrantFacing(x, y) } };
  }, ["==", ["get", "kind"], "hydrant"])
    .slice(0, HYDRANT_CAP)
    .map(({ lon, lat, facing }) => ({ lon, lat, facing }));
}

// ---- Corner street-name signs ----
export const SIGNS_MIN_ZOOM = 17;
const SIGNS_RADIUS_M = 300;
const SIGNS_MAX = 60;

/** One street corner: the two street names and their bearings. */
export interface Sign {
  key: string;
  lng: number;
  lat: number;
  a: string;
  b: string;
  ba: number;
  bb: number;
}

/** The nearest corner signs from the loaded tiles. */
export function nearbySigns(map: Querier): Sign[] {
  const { lng, lat } = map.getCenter();
  return near<Sign>(map, "signs", lng, lat, SIGNS_RADIUS_M, (f) => {
    if (f.geometry.type !== "Point") return null;
    const [x, y] = f.geometry.coordinates;
    const key = `${x.toFixed(6)},${y.toFixed(6)}`;
    return { x, y, key, item: { key, lng: x, lat: y, ...(f.properties as { a: string; b: string; ba: number; bb: number }) } };
  }).slice(0, SIGNS_MAX);
}

// ---- Storefront signboards ----
export const STOREFRONT_MIN_ZOOM = 17;
const STOREFRONT_RADIUS_M = 200;
export const STOREFRONT_MAX = 64; // one 1024 x 1024 atlas: 2 x 32 slots of 512 x 32

export interface StorefrontSign {
  name: string; cat: string; brg: number; sw: number; fl: number; lng: number; lat: number;
  main?: number; dir?: string;
}

function signsNear(map: Querier, lng: number, lat: number, radius: number): Array<StorefrontSign & { d: number }> {
  if (!map.getSource(SOURCE)) return [];
  return near<StorefrontSign>(map, "storefronts", lng, lat, radius, (f) => {
    if (f.geometry.type !== "Point") return null;
    const [x, y] = f.geometry.coordinates;
    const p = f.properties as Omit<StorefrontSign, "lng" | "lat">;
    return { x, y, key: `${x.toFixed(7)},${y.toFixed(7)},${p.name}`, item: { ...p, lng: x, lat: y } };
  });
}

/** Signs from the loaded tiles, nearest first, deduplicated across tile edges. */
export function nearbyStorefronts(map: Querier, radius = STOREFRONT_RADIUS_M, max = STOREFRONT_MAX): StorefrontSign[] {
  const { lng, lat } = map.getCenter();
  return signsNear(map, lng, lat, radius).slice(0, max);
}

/** The storefront sign nearest a point on a building's ground floor (eye-level picking). */
export function storefrontAt(map: Querier, lng: number, lat: number, radius = 12): StorefrontSign | null {
  return signsNear(map, lng, lat, radius)[0] ?? null;
}

/** The directory (main) sign nearest a clicked ground point, for the panel. */
export function directoryAt(map: Querier, lng: number, lat: number): StorefrontSign | null {
  if (map.getZoom() < STOREFRONT_MIN_ZOOM) return null;
  return signsNear(map, lng, lat, 25).find((s) => s.main === 1) ?? null;
}
