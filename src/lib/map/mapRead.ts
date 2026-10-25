/**
 * What the loaded map says about a spot: the street you are on and the cross
 * street, which corner, and landmarks and storefronts close by. Shared by the
 * underground exit helper and the trip preview's walking line. Pure geometry
 * plus one read of the tiles; distances are straight lines.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { LANDMARKS } from "@/lib/map/landmarks";
import { streetPosition, type NamedLine } from "@/lib/map/streetPos";
import { formatStreetName } from "@/lib/streetName";

export type Pt = [number, number];

/** What the basemap knew about an exit's spot while online. */
export interface ExitPlace {
  /** The two nearest street names: "W 42 Street", "7 Avenue". */
  streets: [string, string] | [string] | null;
  /** Which corner of that intersection the exit is on: "NE". */
  corner: string | null;
  /** Landmarks and storefronts near the exit (names and points only), to check facing by. */
  landmarks: LandmarkCandidate[];
}

export interface LandmarkCandidate {
  name: string;
  at: Pt;
  /** Tall landmarks are seen from blocks away; storefronts only from close by. */
  tall: boolean;
}

export function metres(a: Pt, b: Pt): number {
  const kx = 111_320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111_320);
}

/** Compass bearing from a to b, 0 = north, clockwise, 0–359. */
export function bearing(a: Pt, b: Pt): number {
  const kx = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const deg = (Math.atan2((b[0] - a[0]) * kx, b[1] - a[1]) * 180) / Math.PI;
  return Math.round((deg + 360) % 360);
}

/** The corner (NE / SE / SW / NW) of an intersection a point stands on. */
export function cornerOf(intersection: Pt, at: Pt): string {
  const b = bearing(intersection, at);
  return ["NE", "SE", "SW", "NW"][Math.floor((((b % 360) + 360) % 360) / 90)];
}

/** Basemap points that are not something to look for from the sidewalk. */
const SKIP_POI = new Set(["railway", "bus", "telephone", "recycling", "bicycle_rental", "parking", "bicycle_parking", "toilets", "drinking_water", "atm", "entrance"]);

const STREET_CLASSES = new Set(["minor", "service", "tertiary", "secondary", "primary", "trunk", "pedestrian", "living_street"]);

/** The segment of a named street nearest `at`. */
function nearestSeg(lines: NamedLine[], name: string, at: Pt): [Pt, Pt] | null {
  let best: { s: [Pt, Pt]; d: number } | null = null;
  for (const l of lines) {
    if (l.name !== name) continue;
    for (let i = 1; i < l.coords.length; i++) {
      const s: [Pt, Pt] = [l.coords[i - 1], l.coords[i]];
      const mid: Pt = [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2];
      const d = Math.min(metres(s[0], at), metres(s[1], at), metres(mid, at));
      if (!best || d < best.d) best = { s, d };
    }
  }
  return best?.s ?? null;
}

/**
 * Where two named streets meet near `at`: the crossing of their nearest
 * segments, extended (tile lines are simplified and often stop short).
 */
export function meetPoint(lines: NamedLine[], a: string, b: string, at: Pt): Pt | null {
  const s1 = nearestSeg(lines, a, at);
  const s2 = nearestSeg(lines, b, at);
  if (!s1 || !s2) return null;
  const [[x1, y1], [x2, y2]] = s1;
  const [[x3, y3], [x4, y4]] = s2;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-14) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const p: Pt = [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  return metres(p, at) <= 120 ? p : null;
}

/**
 * What the map knows about each exit's spot, from the tiles loaded now:
 * the two nearest street names, which corner, and nearby landmarks and
 * storefronts. Offline (no tiles) everything comes back empty except the
 * fixed landmark list. `pois` also takes the basemap's named shops and
 * places, for the Top view where the 3D storefronts are not loaded.
 */
export function readMap(map: MapLibreMap | null, opts: { pois?: boolean } = {}): { placeAt: (at: Pt) => ExitPlace; lines: NamedLine[] } {
  const lines: NamedLine[] = [];
  const shops: LandmarkCandidate[] = [];
  if (map?.getSource("openmaptiles")) {
    for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation_name" })) {
      const p = f.properties ?? {};
      if (!STREET_CLASSES.has(String(p.class)) || p.brunnel === "tunnel") continue;
      const name = String(p["name:en"] ?? p.name ?? "");
      if (!name) continue;
      const g = f.geometry;
      if (g.type === "LineString") lines.push({ name, coords: g.coordinates as Pt[] });
      else if (g.type === "MultiLineString") for (const c of g.coordinates) lines.push({ name, coords: c as Pt[] });
    }
  }
  if (map?.getSource("city3d")) {
    for (const f of map.querySourceFeatures("city3d", { sourceLayer: "storefronts" })) {
      const name = (f.properties as { name?: string } | null)?.name;
      if (f.geometry.type === "Point" && name) shops.push({ name, at: f.geometry.coordinates as Pt, tall: false });
    }
  }
  if (opts.pois && !shops.length && map?.getSource("openmaptiles")) {
    for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "poi" })) {
      const p = f.properties ?? {};
      const name = String(p["name:en"] ?? p.name ?? "");
      if (name && f.geometry.type === "Point" && !SKIP_POI.has(String(p.class))) shops.push({ name, at: f.geometry.coordinates as Pt, tall: false });
    }
  }
  const tall: LandmarkCandidate[] = LANDMARKS.map((l) => ({ name: l.name, at: [l.lon, l.lat], tall: true }));
  const placeAt = (at: Pt): ExitPlace => {
    const pos = lines.length ? streetPosition(lines, at[0], at[1], 45, 70) : null;
    // streetPosition formats names; find the raw names again for the meeting point.
    const raw = pos ? [...new Set(lines.map((l) => l.name))].filter((n) => formatStreetName(n) === pos.street || formatStreetName(n) === pos.cross) : [];
    const meet = pos?.cross && raw.length >= 2 ? meetPoint(lines, raw[0], raw[1], at) : null;
    return {
      streets: pos ? (pos.cross ? [pos.street, pos.cross] : [pos.street]) : null,
      corner: meet ? cornerOf(meet, at) : null,
      landmarks: [...tall.filter((l) => metres(l.at, at) <= 900), ...shops.filter((s) => metres(s.at, at) <= 60).slice(0, 12)],
    };
  };
  return { placeAt, lines };
}
