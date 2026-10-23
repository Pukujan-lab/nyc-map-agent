import { LANDMARKS } from "@/lib/map/landmarks";
import { distanceAlong, type GuidedRoute } from "./steps";

/**
 * Points of interest near the walking route, bucketed for the next-turn card.
 * Pure: callers pass already-loaded data, nothing is fetched here.
 */
export type PoiKind = "restroom" | "transit" | "landmark";

export interface Poi {
  kind: PoiKind;
  name: string;
  lon: number;
  lat: number;
  /** Metres from the route line. */
  offRoute: number;
  /** Metres along the route from its start to the closest point. */
  along: number;
}

/** One feature of the deployed /api/restrooms GeoJSON FeatureCollection. */
export interface RestroomFeature {
  geometry: { coordinates: [number, number] } | null;
  properties?: { name?: string; status?: string; location_type?: string } | null;
}

/** Minimal transit stop: a subway station or bus stop with a position. */
export interface TransitStop {
  name: string;
  lon: number;
  lat: number;
}

export interface PoiSources {
  restrooms?: RestroomFeature[];
  transit?: TransitStop[];
  /** Defaults to the app's hero landmarks. */
  landmarks?: Array<{ name: string; lon: number; lat: number }>;
}

export const POI_RADIUS_M = 50;

const M_PER_DEG = 111_320;

/** Metres from a point to the nearest part of the polyline (local flat approximation). */
export function distanceToRoute(coords: Array<[number, number]>, lon: number, lat: number): number {
  if (coords.length === 0) return Number.POSITIVE_INFINITY;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < Math.max(1, coords.length - 1); i += 1) {
    const a = coords[i];
    const b = coords[i + 1] ?? a;
    const ax = (a[0] - lon) * cosLat;
    const ay = a[1] - lat;
    const dx = (b[0] - a[0]) * cosLat;
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy) * M_PER_DEG);
  }
  return best;
}

/** Everything within `radiusM` of the route, ordered along it, one list per kind. */
export function poisAlongRoute(
  route: GuidedRoute,
  sources: PoiSources,
  radiusM: number = POI_RADIUS_M,
): Record<PoiKind, Poi[]> {
  const out: Record<PoiKind, Poi[]> = { restroom: [], transit: [], landmark: [] };
  const consider = (kind: PoiKind, name: string, lon: number, lat: number) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const offRoute = distanceToRoute(route.coordinates, lon, lat);
    if (offRoute > radiusM) return;
    out[kind].push({ kind, name, lon, lat, offRoute, along: distanceAlong(route.coordinates, { lon, lat }) });
  };
  for (const f of sources.restrooms ?? []) {
    if (!f.geometry || f.properties?.status === "Closed") continue;
    consider("restroom", f.properties?.name || "Public restroom", f.geometry.coordinates[0], f.geometry.coordinates[1]);
  }
  for (const s of sources.transit ?? []) consider("transit", s.name, s.lon, s.lat);
  for (const l of sources.landmarks ?? LANDMARKS) consider("landmark", l.name, l.lon, l.lat);
  for (const list of Object.values(out)) list.sort((a, b) => a.along - b.along);
  return out;
}

const LABEL: Record<PoiKind, string> = { restroom: "Restroom", transit: "Transit", landmark: "Landmark" };

/**
 * Short list for the next-turn card: POIs from just behind `along` to `aheadM`
 * further, at most `max`, one per kind before repeating a kind, in walking order.
 */
export function poiSummary(
  pois: Record<PoiKind, Poi[]>,
  along: number,
  aheadM: number,
  max = 3,
): Array<{ kind: PoiKind; text: string }> {
  const ahead = [...pois.restroom, ...pois.transit, ...pois.landmark]
    .filter((p) => p.along >= along - 10 && p.along <= along + aheadM)
    .sort((a, b) => a.along - b.along);
  const seen = new Set<PoiKind>();
  const first = ahead.filter((p) => (seen.has(p.kind) ? false : (seen.add(p.kind), true)));
  const rest = ahead.filter((p) => !first.includes(p));
  return [...first, ...rest]
    .slice(0, max)
    .sort((a, b) => a.along - b.along)
    .map((p) => ({
      kind: p.kind,
      text: `${LABEL[p.kind]}: ${p.name}, ${Math.max(0, Math.round((p.along - along) / 10) * 10)} m ahead`,
    }));
}
