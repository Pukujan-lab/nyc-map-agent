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
  return { lon, lat, grade: g[lo], ax: a, bx: b };
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
    grade: here.grade,
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
      const dx = (b[0] - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), dy = (b[1] - a[1]) * 111_320;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const brg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      features.push({ type: "Feature", properties: { color: f.properties.color }, geometry: bodyPolygonFlat(mid[0], mid[1], brg, len + 1, 7) });
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
    const c = f.geometry.coordinates;
    for (let i = 1; i < c.length; i++) {
      const dx = (c[i][0] - c[i - 1][0]) * 111_320 * Math.cos((c[i][1] * Math.PI) / 180), dy = (c[i][1] - c[i - 1][1]) * 111_320;
      acc += Math.hypot(dx, dy);
      if (acc < 40) continue;
      acc = 0;
      features.push({ type: "Feature", properties: {}, geometry: bodyPolygonFlat(c[i][0], c[i][1], 0, 1.2, 1.2) });
    }
  }
  return { type: "FeatureCollection", features };
}
