import type { OsmToilet } from "./osm";
import type { Restroom, RestroomsResponse } from "./schema";

/** A city restroom and an OSM toilet closer than this are the same place. */
export const SAME_PLACE_M = 40;

/** One row of core.restrooms (the city list). */
export interface CityRestroom {
  name: string;
  status: string | null;
  hours: string | null;
  accessibility: string | null;
  operator: string | null;
  location_type: string | null;
  changing_stations: string | null;
  /** The Socrata row's :updated_at (ISO), or when it was loaded. */
  updated_at: string | null;
  lon: number;
  lat: number;
}

/** Rough metres between two lon/lat points (equirectangular; fine at city scale). */
export function metresBetween(a: [number, number], b: [number, number]): number {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((a[0] - b[0]) * k * 111_320, (a[1] - b[1]) * 110_540);
}

/**
 * Pairs each city restroom with at most one OSM toilet within `radius`,
 * closest pairs first, so two nearby restrooms never claim the same toilet.
 * Returns a map from city index to OSM index.
 */
export function matchSamePlaces(city: Array<{ lon: number; lat: number }>, osm: Array<{ lon: number; lat: number }>, radius = SAME_PLACE_M): Map<number, number> {
  const latCell = radius / 110_540;
  const buckets = new Map<number, number[]>();
  osm.forEach((o, j) => {
    const key = Math.floor(o.lat / latCell);
    const list = buckets.get(key);
    if (list) list.push(j);
    else buckets.set(key, [j]);
  });
  const pairs: Array<[number, number, number]> = [];
  city.forEach((c, i) => {
    const key = Math.floor(c.lat / latCell);
    for (let k = key - 1; k <= key + 1; k++) {
      for (const j of buckets.get(k) ?? []) {
        const d = metresBetween([c.lon, c.lat], [osm[j].lon, osm[j].lat]);
        if (d <= radius) pairs.push([i, j, d]);
      }
    }
  });
  pairs.sort((a, b) => a[2] - b[2]);
  const out = new Map<number, number>();
  const taken = new Set<number>();
  for (const [i, j] of pairs) {
    if (out.has(i) || taken.has(j)) continue;
    out.set(i, j);
    taken.add(j);
  }
  return out;
}

const WHEELCHAIR: Record<string, string> = {
  yes: "Fully Accessible",
  designated: "Fully Accessible",
  limited: "Partially Accessible",
  no: "Not Accessible",
};

const yesNoText = (v: string | null): boolean | null => {
  const s = v?.trim().toLowerCase();
  return s === "yes" ? true : s === "no" ? false : null;
};

function fromCity(c: CityRestroom, o: OsmToilet | undefined): Restroom {
  const filled: string[] = [];
  const fill = <T>(field: string, mine: T | null, theirs: T | null | undefined): T | null => {
    if (mine !== null && mine !== "") return mine;
    if (theirs === null || theirs === undefined) return null;
    filled.push(field);
    return theirs;
  };
  return {
    id: `nyc:${c.name}`,
    name: c.name,
    source: "nyc-open-data",
    asOf: c.updated_at,
    status: c.status,
    hours: fill("hours", c.hours, o?.openingHours),
    accessibility: fill("accessibility", c.accessibility, o?.wheelchair ? WHEELCHAIR[o.wheelchair] : null),
    operator: fill("operator", c.operator, o?.operator),
    location_type: c.location_type,
    fee: fill("fee", null, o?.fee),
    changingTable: fill("changingTable", yesNoText(c.changing_stations), o?.changingTable),
    unisex: fill("unisex", null, o?.unisex),
    osmId: o?.id ?? null,
    osmUrl: o?.url ?? null,
    filledFromOsm: filled,
  };
}

function fromOsm(o: OsmToilet): Restroom {
  return {
    id: o.id,
    name: o.name ?? "Public toilet",
    source: "openstreetmap",
    asOf: o.editedAt,
    status: null,
    hours: o.openingHours,
    accessibility: o.wheelchair ? (WHEELCHAIR[o.wheelchair] ?? null) : null,
    operator: o.operator,
    location_type: null,
    fee: o.fee,
    changingTable: o.changingTable,
    unisex: o.unisex,
    osmId: o.id,
    osmUrl: o.url,
    filledFromOsm: [],
  };
}

const latest = (xs: Array<string | null>): string | null => xs.reduce<string | null>((m, x) => (x && (!m || x > m) ? x : m), null);

/**
 * The merged restroom list: every city restroom (with gaps filled from a
 * matched OSM toilet) plus the OSM toilets that match no city restroom.
 */
export function mergeRestrooms(city: CityRestroom[], osm: OsmToilet[]): RestroomsResponse {
  const match = matchSamePlaces(city, osm);
  const used = new Set(match.values());
  const feature = (r: Restroom, lon: number, lat: number) => ({
    type: "Feature" as const,
    id: r.id,
    geometry: { type: "Point" as const, coordinates: [lon, lat] as [number, number] },
    properties: r,
  });
  const features = [
    ...city.map((c, i) => {
      const j = match.get(i);
      return feature(fromCity(c, j === undefined ? undefined : osm[j]), c.lon, c.lat);
    }),
    ...osm.filter((_, j) => !used.has(j)).map((o) => feature(fromOsm(o), o.lon, o.lat)),
  ];
  return {
    type: "FeatureCollection",
    features,
    sources: [
      { id: "nyc-open-data", asOf: latest(city.map((c) => c.updated_at)), count: city.length },
      { id: "openstreetmap", asOf: latest(osm.map((o) => o.editedAt)), count: osm.length - used.size },
    ],
  };
}
