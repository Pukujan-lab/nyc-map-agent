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
 * Where along its route shape a train is now: metres from the shape start,
 * which way it is moving (+1 / -1) and its next stop with predicted time.
 * Linear in time between stops, so it is continuous as `now` advances.
 */
export function trainProgress(sys: StaticSystem, trip: LiveTrip, now: number): { m: number; forward: number; next: { id: string; t: number; m: number } } | null {
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
  return { m, forward, next };
}

/** A point on a route shape at distance `m`, with its track height and grade. */
export function trackPoint(sys: StaticSystem, route: string, m: number): { lon: number; lat: number; z: number; grade: Grade } | null {
  const shape = sys.shapes[route];
  if (!shape) return null;
  const here = pointAt(shape, m);
  const prof = trackHeightProfile(sys, route);
  const z = prof ? prof.h[here.lo] + (prof.h[here.hi] - prof.h[here.lo]) * here.f : 0;
  return { lon: here.lon, lat: here.lat, z, grade: prof ? prof.grade[here.lo] : here.grade };
}

/**
 * Approximate where a train is now: between the last stop whose time has
 * passed and the next one, linearly in time, measured along the route shape.
 * Feeds drop passed stops, so with no passed stop we extrapolate back from the
 * first two upcoming ones (capped). Returns null when we cannot place it.
 */
export function estimateTrain(sys: StaticSystem, trip: LiveTrip, now: number): Vehicle | null {
  const shape = sys.shapes[trip.route];
  const p = trainProgress(sys, trip, now);
  if (!shape || !p) return null;
  const { m, forward, next } = p;
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

function bodyPolygonFlat(lon: number, lat: number, bearing: number, length: number, width: number): GeoJSON.Polygon {
  const p = bodyPolygon(lon, lat, bearing, length, width).coordinates[0];
  return { type: "Polygon", coordinates: [[p[1], p[2], p[3], p[4], p[1]]] };
}

/**
 * Hand-placed rail structures the OSM grade match gets wrong or that need a
 * real deck height. Bridges are drawn by the bridges work in the shared
 * threeLayer, so we draw no viaduct there; trains just ride at `deck`.
 */
export type Structure = { id: string; kind: "bridge" | "viaduct"; deck: number; routes: string[]; line: Array<[number, number]> };
export const STRUCTURES: Structure[] = [
  // Subway tracks on the Manhattan Bridge (B D N Q), lower level ~40 m over the river.
  { id: "manhattan-bridge", kind: "bridge", deck: 40, routes: ["B", "D", "N", "Q"], line: [[-73.9947, 40.7149], [-73.9902, 40.7072], [-73.9866, 40.7010]] },
  // J M Z on the Williamsburg Bridge, centre tracks ~38 m.
  { id: "williamsburg-bridge", kind: "bridge", deck: 38, routes: ["J", "M", "Z"], line: [[-73.9807, 40.7166], [-73.9712, 40.7135], [-73.9617, 40.7104]] },
  // 1 train's Manhattan Valley Viaduct over 125 St, ~16 m.
  { id: "manhattan-valley-viaduct", kind: "viaduct", deck: 16, routes: ["1"], line: [[-73.9620, 40.8105], [-73.9585, 40.8158], [-73.9561, 40.8205]] },
];

function metresToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111_320;
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * 111_320, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * 111_320;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + dx * t, ay + dy * t);
}
export function structureAt(p: [number, number], within = 60, route?: string): Structure | undefined {
  return STRUCTURES.find((s) => (!route || s.routes.includes(route)) && s.line.some((a, i) => i > 0 && metresToSegment(p, s.line[i - 1], a) < within));
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
      const s = sys.system === "subway" ? structureAt(shape.c[i], 60, route) : undefined;
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

/**
 * Raised track from the height profiles: one deck quad per shape segment that
 * sits above ground (viaducts, portal ramps, bridge decks), each at its own
 * height, so bridge tracks climb, hold the deck and descend. Piers only off
 * the bridges. `raisedCells` lets the ground lines step aside under them.
 */
export function raisedTrack(sys: StaticSystem): {
  decks: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  piers: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  raisedCells: Set<string>;
} {
  const decks: GeoJSON.Feature<GeoJSON.Polygon>[] = [], piers: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const raisedCells = new Set<string>();
  if (sys.system !== "subway") return { decks: { type: "FeatureCollection", features: decks }, piers: { type: "FeatureCollection", features: piers }, raisedCells };
  for (const route of Object.keys(sys.shapes)) {
    const shape = sys.shapes[route];
    const prof = trackHeightProfile(sys, route);
    if (!prof) continue;
    const color = sys.routes[route]?.color ?? "#808183";
    let sincePier = 0;
    for (let i = 1; i < shape.c.length; i++) {
      const top = (prof.h[i - 1] + prof.h[i]) / 2;
      if (top < 1) continue;
      const [a, b] = [shape.c[i - 1], shape.c[i]];
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      raisedCells.add(cellKey(a)).add(cellKey(b));
      const dx = (b[0] - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), dy = (b[1] - a[1]) * 111_320;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const brg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      const bridge = structureAt(mid, 150, route)?.kind === "bridge";
      decks.push({ type: "Feature", properties: { color, top, bridge }, geometry: bodyPolygonFlat(mid[0], mid[1], brg, len + 1, bridge ? 3.5 : 7) });
      sincePier += len;
      if (!bridge && sincePier > 40) {
        sincePier = 0;
        piers.push({ type: "Feature", properties: { top }, geometry: bodyPolygonFlat(b[0], b[1], 0, 1.2, 1.2) });
      }
    }
  }
  return { decks: { type: "FeatureCollection", features: decks }, piers: { type: "FeatureCollection", features: piers }, raisedCells };
}
/** ~45 m grid cell key. */
export const cellKey = (p: GeoJSON.Position) => `${Math.round(p[0] * 2400)},${Math.round(p[1] * 2400)}`;

/** Split subway ground lines into runs, marking runs under raised track `raised` so 3D hides them and 2D draws them solid. */
export function splitRaised(lines: GeoJSON.Feature<GeoJSON.LineString>[], raised: Set<string>): GeoJSON.Feature<GeoJSON.LineString>[] {
  const out: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const f of lines) {
    const c = f.geometry.coordinates;
    const flag = c.map((p) => raised.has(cellKey(p)));
    let start = 0;
    for (let i = 1; i <= c.length; i++) {
      if (i === c.length || flag[i] !== flag[start]) {
        const seg = c.slice(start, Math.min(i + 1, c.length));
        if (seg.length > 1) out.push({ ...f, properties: { ...f.properties, grade: flag[start] ? "elevated" : (f.properties as { grade: Grade }).grade }, geometry: { type: "LineString", coordinates: seg } });
        start = i;
      }
    }
  }
  return out;
}

/** One 15 m viaduct bay (columns + girders + rails) centred at lon/lat; `station` bays get a platform and canopy. */
export type Bay = { lon: number; lat: number; bearing: number; top: number; len: number; station: boolean };
const BAY = 15;
const BRIDGE_BOX = STRUCTURES.filter((s) => s.kind === "bridge").map((s) => {
  const xs = s.line.map((p) => p[0]), ys = s.line.map((p) => p[1]);
  return [Math.min(...xs) - 0.002, Math.min(...ys) - 0.002, Math.max(...xs) + 0.002, Math.max(...ys) + 0.002];
});

/**
 * Bays along elevated subway shapes (not bridges, which have their own model; not portal ramps under 5 m).
 * Several routes share one structure, so bays are de-duplicated on a ~10 m grid by heading.
 */
export function viaductBays(sys: StaticSystem): Bay[] {
  if (sys.system !== "subway") return [];
  const seen = new Set<string>(), bays: Bay[] = [];
  // ~45 m cells around each station (3x3 neighbourhood ≈ an 8-car platform either side).
  const stationCells = new Set<string>();
  for (const f of sys.stations.features) {
    const [x, y] = f.geometry.coordinates;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) stationCells.add(`${Math.round(x * 2400) + dx},${Math.round(y * 2400) + dy}`);
  }
  const nearBridge = (p: [number, number], route: string) => BRIDGE_BOX.some((b) => p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3]) && structureAt(p, 80, route)?.kind === "bridge";
  for (const route of Object.keys(sys.shapes)) {
    const shape = sys.shapes[route], prof = trackHeightProfile(sys, route);
    if (!prof) continue;
    let carry = 0;
    for (let i = 1; i < shape.c.length; i++) {
      const [a, b] = [shape.c[i - 1], shape.c[i]];
      const ha = prof.h[i - 1], hb = prof.h[i], seg = shape.m[i] - shape.m[i - 1];
      if (Math.min(ha, hb) < 5 || seg <= 0) { carry = 0; continue; }
      const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
      const brg = ((Math.atan2((b[0] - a[0]) * kx, (b[1] - a[1]) * 111_320) * 180) / Math.PI + 360) % 360;
      for (let d = carry; d < seg; d += BAY) {
        const t = d / seg, lon = a[0] + (b[0] - a[0]) * t, lat = a[1] + (b[1] - a[1]) * t;
        if (nearBridge([lon, lat], route)) continue;
        const key = `${Math.round(lon * 9000)},${Math.round(lat * 9000)},${Math.round((brg % 180) / 20)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const station = stationCells.has(cellKey([lon, lat]));
        bays.push({ lon, lat, bearing: brg, top: ha + (hb - ha) * t, len: BAY, station });
      }
      carry = (carry + Math.ceil((seg - carry) / BAY) * BAY) - seg;
    }
  }
  return bays;
}

/** A street entrance for the 3D kit: faces its station (stairs descend toward the platform). */
export type EntranceInstance = { lon: number; lat: number; bearing: number; kind: "stair" | "elevator"; out: boolean };
export function entranceInstances(sys: StaticSystem, outStations: Set<string>, center: [number, number], radius = 300): EntranceInstance[] {
  const st = new Map(sys.stations.features.map((f) => [String(f.properties.id), f.geometry.coordinates as [number, number]]));
  const kx = 111_320 * Math.cos((center[1] * Math.PI) / 180), out: EntranceInstance[] = [];
  for (const f of sys.entrances?.features ?? []) {
    const [lon, lat] = f.geometry.coordinates;
    if (Math.hypot((lon - center[0]) * kx, (lat - center[1]) * 111_320) > radius) continue;
    if (!/stair|elevator|escalator/i.test(f.properties.kind)) continue; // easements, station houses, walkways: no kit
    const s = st.get(String(f.properties.id));
    const bearing = s ? ((Math.atan2((s[0] - lon) * kx, (s[1] - lat) * 111_320) * 180) / Math.PI + 360) % 360 : 0;
    const elevator = /elevator/i.test(f.properties.kind);
    out.push({ lon, lat, bearing, kind: elevator ? "elevator" : "stair", out: elevator && outStations.has(String(f.properties.id)) });
  }
  return out;
}

/** OSM `level` like "-2", "-1;0", "-2--1" → [min, max]. */
export function parseLevel(v: string | undefined, fallback = 0): [number, number] {
  const n = (v ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  return n.length ? [Math.min(...n), Math.max(...n)] : [fallback, fallback];
}
/** One station's insides for the x-ray view (public/transit/xray.json, keyed by GTFS station id). */
export type XrayWay = { k: "platform" | "steps" | "corridor"; c: Array<[number, number]>; from: number; to: number };
export type XrayStation = { ways: XrayWay[]; elevators: Array<{ lon: number; lat: number; from: number }> };
/** Metres per OSM level. */
export const LEVEL_M = 5;
