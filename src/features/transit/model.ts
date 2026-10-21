/** Pure transit math: estimated train positions along GTFS shapes, arrivals, vehicle bodies. */
export type SystemId = "subway" | "lirr" | "mnr";
export const RAIL_SYSTEMS: SystemId[] = ["subway", "lirr", "mnr"];
export const SYSTEM_LABELS: Record<SystemId | "bus", string> = {
  subway: "Subway",
  lirr: "LIRR",
  mnr: "Metro-North",
  bus: "Buses",
};
export type Grade = "underground" | "grade" | "elevated";
/** Viaduct deck height in metres; elevated trains ride on top of it. */
export const VIADUCT_TOP = 8;

export type RouteInfo = { name: string; short: string; color: string; text: string };
export type StaticSystem = {
  system: SystemId;
  routes: Record<string, RouteInfo>;
  lines: GeoJSON.FeatureCollection<GeoJSON.LineString, { route: string; color: string; grade: Grade }>;
  stations: GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; name: string; routes: string }>;
  shapes: Record<string, { c: Array<[number, number]>; m: number[]; g: Grade[] }>;
  stopM: Record<string, Record<string, number>>;
  entrances?: GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; name: string; kind: string }>;
};
export type LiveTrip = { id: string; route: string; dir: number | null; stops: Array<[string, number]>; at?: string };
export type LiveSystem = { at: number; trips: LiveTrip[] };
export type Bus = { id: string; route: string; dir: number | null; lon: number; lat: number; bearing: number | null; next: string | null; t: number };

export type Vehicle = {
  key: string;
  system: SystemId | "bus";
  route: string;
  label: string;
  color: string;
  lon: number;
  lat: number;
  bearing: number;
  grade: Grade;
  /** Metres above ground (track height profile); 0 for buses. */
  z?: number;
  dir: number | null;
  nextStop?: string;
  eta?: number;
};

/** Subway platform ids are the station id plus N/S. */
export const stationOf = (system: SystemId, stopId: string) =>
  system === "subway" ? stopId.replace(/[NS]$/, "") : stopId;

export function directionLabel(system: SystemId | "bus", stopId: string, dir: number | null): string {
  if (system === "subway") return stopId.endsWith("S") ? "Downtown" : "Uptown";
  if (system === "bus") return dir === 1 ? "Direction 1" : "Direction 0";
  return dir === 1 ? "To NYC" : "From NYC";
}

function pointAt(shape: StaticSystem["shapes"][string], m: number) {
  const { c, m: ms, g } = shape;
  let lo = 0, hi = ms.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ms[mid] <= m) lo = mid; else hi = mid;
  }
  const a = c[lo], b = c[hi];
  const f = ms[hi] === ms[lo] ? 0 : Math.min(1, Math.max(0, (m - ms[lo]) / (ms[hi] - ms[lo])));
  const lon = a[0] + (b[0] - a[0]) * f, lat = a[1] + (b[1] - a[1]) * f;
  return { lon, lat, grade: g[lo], lo, hi, f };
}

function bearingOf(a: [number, number], b: [number, number]) {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), dy = b[1] - a[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/**
 * Approximate where a train is now: between the last stop whose time has
 * passed and the next one, linearly in time, measured along the route shape.
 * Feeds drop passed stops, so with no passed stop we extrapolate back from the
 * first two upcoming ones (capped). Returns null when we cannot place it.
 */
export function estimateTrain(sys: StaticSystem, trip: LiveTrip, now: number): Vehicle | null {
  const shape = sys.shapes[trip.route];
  const sm = sys.stopM[trip.route];
  if (!shape || !sm) return null;
  const pts = trip.stops
    .map(([id, t]) => ({ id, t, m: sm[stationOf(sys.system, id)] }))
    .filter((p): p is { id: string; t: number; m: number } => p.m !== undefined);
  if (!pts.length) return null;
  const k = pts.findIndex((p) => p.t > now);
  if (k === -1) return null; // finished
  const next = pts[k];
  if (next.t - now > 30 * 60) return null; // not running yet
  let m: number;
  let forward: number;
  if (k > 0) {
    const prev = pts[k - 1];
    const f = (now - prev.t) / Math.max(1, next.t - prev.t);
    m = prev.m + (next.m - prev.m) * f;
    forward = Math.sign(next.m - prev.m) || 1;
  } else if (pts[1]) {
    const speed = (pts[1].m - next.m) / Math.max(1, pts[1].t - next.t);
    forward = Math.sign(speed) || 1;
    const back = Math.min(Math.abs(speed * (next.t - now)), 1500);
    m = next.m - forward * back;
  } else {
    m = next.m;
    forward = 1;
  }
  const here = pointAt(shape, m);
  const prof = trackHeightProfile(sys, trip.route);
  const z = prof ? prof.h[here.lo] + (prof.h[here.hi] - prof.h[here.lo]) * here.f : 0;
  const grade = prof ? prof.grade[here.lo] : here.grade;
  const ahead = pointAt(shape, m + forward * 30);
  const route = sys.routes[trip.route];
  return {
    key: `${sys.system}:${trip.id}`,
    system: sys.system,
    route: trip.route,
    label: route?.short ?? trip.route,
    color: route?.color ?? "#808183",
    lon: here.lon,
    lat: here.lat,
    bearing: bearingOf([here.lon, here.lat], [ahead.lon, ahead.lat]),
    grade,
    z,
    dir: trip.dir,
    nextStop: next.id,
    eta: next.t,
  };
}

export type Arrival = { route: string; direction: string; times: number[] };

/** Next arrivals at one station, grouped by line and direction. */
export function arrivalsAt(system: SystemId, live: LiveSystem | undefined, stationId: string, now: number): Arrival[] {
  const groups = new Map<string, Arrival>();
  for (const trip of live?.trips ?? []) {
    for (const [stop, t] of trip.stops) {
      if (t < now - 30 || stationOf(system, stop) !== stationId) continue;
      const direction = directionLabel(system, stop, trip.dir);
      const key = `${trip.route}|${direction}`;
      const g = groups.get(key) ?? groups.set(key, { route: trip.route, direction, times: [] }).get(key)!;
      g.times.push(t);
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, times: g.times.sort((a, b) => a - b).slice(0, 3) }))
    .sort((a, b) => a.route.localeCompare(b.route) || a.direction.localeCompare(b.direction));
}

export const minutesUntil = (t: number, now: number) => Math.max(0, Math.floor((t - now) / 60));

/** Oriented rectangle footprint (length × width metres) for a fill-extrusion vehicle body. */
export function bodyPolygon(lon: number, lat: number, bearing: number, length: number, width: number): GeoJSON.Polygon {
  const rad = (bearing * Math.PI) / 180;
  const mLat = 1 / 111_320, mLon = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const fx = Math.sin(rad), fy = Math.cos(rad); // forward unit (east, north)
  const corner = (along: number, across: number): [number, number] => [
    lon + (fx * along + fy * across) * mLon,
    lat + (fy * along - fx * across) * mLat,
  ];
  const l = length / 2, w = width / 2;
  // Pointed nose so heading reads in 3D.
  return { type: "Polygon", coordinates: [[corner(l + 2, 0), corner(l, w), corner(-l, w), corner(-l, -w), corner(l, -w), corner(l + 2, 0)]] };
}

/** Thin deck polygons under elevated runs: one quad per segment. */
export function viaductPolygons(lines: StaticSystem["lines"]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const f of lines.features) {
    if (f.properties.grade !== "elevated") continue;
    const c = f.geometry.coordinates;
    for (let i = 1; i < c.length; i++) {
      const [a, b] = [c[i - 1], c[i]];
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (structureAt(mid, 120)?.kind === "bridge") continue; // the bridge model carries the track
      const dx = (b[0] - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), dy = (b[1] - a[1]) * 111_320;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const brg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      features.push({ type: "Feature", properties: { color: f.properties.color, top: structureAt(mid)?.deck ?? VIADUCT_TOP }, geometry: bodyPolygonFlat(mid[0], mid[1], brg, len + 1, 7) });
    }
  }
  return { type: "FeatureCollection", features };
}
function bodyPolygonFlat(lon: number, lat: number, bearing: number, length: number, width: number): GeoJSON.Polygon {
  const p = bodyPolygon(lon, lat, bearing, length, width).coordinates[0];
  return { type: "Polygon", coordinates: [[p[1], p[2], p[3], p[4], p[1]]] };
}

/** Square piers every ~40 m under elevated runs. */
export function viaductPiers(lines: StaticSystem["lines"]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const f of lines.features) {
    if (f.properties.grade !== "elevated") continue;
    let acc = 0;
    if (structureAt(f.geometry.coordinates[0] as [number, number], 120)?.kind === "bridge") continue;
    const c = f.geometry.coordinates;
    for (let i = 1; i < c.length; i++) {
      const dx = (c[i][0] - c[i - 1][0]) * 111_320 * Math.cos((c[i][1] * Math.PI) / 180), dy = (c[i][1] - c[i - 1][1]) * 111_320;
      acc += Math.hypot(dx, dy);
      if (acc < 40) continue;
      acc = 0;
      features.push({ type: "Feature", properties: { top: structureAt(c[i] as [number, number])?.deck ?? VIADUCT_TOP }, geometry: bodyPolygonFlat(c[i][0], c[i][1], 0, 1.2, 1.2) });
    }
  }
  return { type: "FeatureCollection", features };
}

/**
 * Hand-placed rail structures the OSM grade match gets wrong or that need a
 * real deck height. Bridges are drawn by the bridges work in the shared
 * threeLayer, so we draw no viaduct there; trains just ride at `deck`.
 */
export type Structure = { id: string; kind: "bridge" | "viaduct"; deck: number; line: Array<[number, number]> };
export const STRUCTURES: Structure[] = [
  // Subway tracks on the Manhattan Bridge (B D N Q), lower level ~40 m over the river.
  { id: "manhattan-bridge", kind: "bridge", deck: 40, line: [[-73.9944, 40.7136], [-73.9906, 40.7075], [-73.9862, 40.7032]] },
  // J M Z on the Williamsburg Bridge, centre tracks ~38 m.
  { id: "williamsburg-bridge", kind: "bridge", deck: 38, line: [[-73.9807, 40.7166], [-73.9712, 40.7135], [-73.9617, 40.7104]] },
  // 1 train's Manhattan Valley Viaduct over 125 St, ~16 m.
  { id: "manhattan-valley-viaduct", kind: "viaduct", deck: 16, line: [[-73.9620, 40.8105], [-73.9585, 40.8158], [-73.9561, 40.8205]] },
];

function metresToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111_320;
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * 111_320, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * 111_320;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + dx * t, ay + dy * t);
}
export function structureAt(p: [number, number], within = 60): Structure | undefined {
  return STRUCTURES.find((s) => s.line.some((a, i) => i > 0 && metresToSegment(p, s.line[i - 1], a) < within));
}

const MAX_GRADE = 0.035; // 3.5 % ramps from portals / up to decks
const profiles = new WeakMap<object, { h: Float32Array; grade: Grade[] }>();
/**
 * Track height (metres above ground) for every vertex of a route's shape:
 * underground 0 (drawn as ghosts), at grade 0, elevated VIADUCT_TOP, bridges
 * and hand-placed viaducts at their deck, with ramps no steeper than 3.5 %
 * so trains climb out of the tunnel portal, hold the deck, and descend.
 * Bridge models can call this to align their track decks.
 */
export function trackHeightProfile(sys: StaticSystem, route: string): { m: number[]; h: Float32Array; grade: Grade[] } | null {
  const shape = sys.shapes[route];
  if (!shape) return null;
  let p = profiles.get(shape);
  if (!p) {
    const n = shape.c.length, h = new Float32Array(n), grade = shape.g.slice();
    for (let i = 0; i < n; i++) {
      const s = sys.system === "subway" ? structureAt(shape.c[i]) : undefined;
      if (s) { grade[i] = "elevated"; h[i] = s.deck; }
      else if (sys.system !== "subway") grade[i] = "grade";
      else h[i] = grade[i] === "elevated" ? VIADUCT_TOP : 0;
    }
    // Ramps: a forward and a backward max-plus pass.
    for (let i = 1; i < n; i++) h[i] = Math.max(h[i], h[i - 1] - MAX_GRADE * (shape.m[i] - shape.m[i - 1]));
    for (let i = n - 2; i >= 0; i--) h[i] = Math.max(h[i], h[i + 1] - MAX_GRADE * (shape.m[i + 1] - shape.m[i]));
    // A ramp out of a tunnel is above ground: treat it as elevated, not a ghost.
    for (let i = 0; i < n; i++) if (h[i] > 1 && grade[i] === "underground") grade[i] = "elevated";
    p = { h, grade };
    profiles.set(shape, p);
  }
  return { m: shape.m, ...p };
}
