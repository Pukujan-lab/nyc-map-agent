import { bearing, metres, type Pt } from "@/lib/map/mapRead";
import { publishActiveTrip, type ActiveTrip } from "@/lib/transit/activeTrip";

/**
 * A pretend trip for `?sim=walk`, so anyone can watch the "you" marker work
 * without going outside: walk through Union Square Park to a 14 St–Union Sq
 * stair, down to the platform, ride the uptown 6 to Grand Central (pausing at
 * each stop), up a stair on 42 St and walk west to the Bryant Park restroom.
 * Built from the app's own subway file, so the ride follows the real track.
 * Played several times faster than life. It is a geolocation feed like the
 * browser's, so everything that reads your location sees it the same way.
 * `?sim=wrongway` puts the same trip on screen but boards the downtown 6 by
 * mistake and rides to Astor Pl, so the wrong-direction warning can be watched.
 */
type Geo = Pick<Geolocation, "watchPosition" | "clearWatch">;

export interface SimSample {
  at: Pt;
  /** Metres: small on the street, large below ground where GPS is weak. */
  accuracy: number;
  course: number | null;
  speed: number;
}

export const SIM_TICK_MS = 500;
const WALK_STEP_M = 5;
const RIDE_STEP_M = 40;
const STREET_ACC = 8;
const BELOW_ACC = 120;

/** Points every `step` metres along a line, ending exactly at its last point. */
export function along(line: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const n = Math.max(1, Math.ceil(metres(a, b) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (line.length) out.push(line[line.length - 1]);
  return out;
}

function leg(line: Pt[], step: number, accuracy: number): SimSample[] {
  const pts = along(line, step);
  const speed = (step * 1000) / SIM_TICK_MS;
  return pts.map((at, i) => {
    const next = pts[i + 1] ?? null;
    const prev = pts[i - 1] ?? null;
    const course = next ? bearing(at, next) : prev ? bearing(prev, at) : null;
    return { at, accuracy, course, speed: next ? speed : 0 };
  });
}

function wait(at: Pt, ticks: number, accuracy: number): SimSample[] {
  return Array.from({ length: ticks }, () => ({ at, accuracy, course: null, speed: 0 }));
}

interface SubwayFile {
  shapes: Record<string, { c: Pt[]; m: number[] }>;
  stopM: Record<string, Record<string, number>>;
  stations?: { features: Array<{ properties: { id: string | number; name: string }; geometry: { coordinates: number[] } }> };
}

const PARK: Pt = [-73.9904, 40.7362];
const UNION_SQ_STAIR: Pt = [-73.9897, 40.73426];
const GRAND_CENTRAL_STAIR: Pt = [-73.97594, 40.75129];
/** 42 St from Lexington to the restroom behind the library in Bryant Park. */
const FORTY_SECOND: Pt[] = [[-73.97556, 40.75131], [-73.97723, 40.75207], [-73.97948, 40.75302], [-73.9811, 40.7537], [-73.9833, 40.7538]];

/** The whole pretend trip, one sample per tick. */
export function buildSimWalk(data: SubwayFile): SimSample[] {
  const shape = data.shapes["6"];
  const stops = data.stopM["6"];
  const from = stops["635"];
  const to = stops["631"];
  // The 6's shape runs from the Bronx down, so uptown is falling distance.
  const idx = shape.m.flatMap((m, i) => (m <= from && m >= to ? [i] : [])).reverse();
  const ride = idx.map((i) => shape.c[i]);
  const startPlatform = ride[0];
  const endPlatform = ride[ride.length - 1];
  const out: SimSample[] = [
    ...wait(PARK, 4, STREET_ACC),
    ...leg([PARK, [-73.9902, 40.7352], UNION_SQ_STAIR], WALK_STEP_M, STREET_ACC),
    ...leg([UNION_SQ_STAIR, startPlatform], WALK_STEP_M, 40),
    ...wait(startPlatform, 6, BELOW_ACC),
  ];
  // Ride, pausing at 23 St, 28 St and 33 St.
  const pauses = ["634", "633", "632"].map((id) => stops[id]);
  let last = from;
  for (const stop of [...pauses, to]) {
    const part = idx.filter((i) => shape.m[i] <= last && shape.m[i] >= stop).map((i) => shape.c[i]);
    if (part.length > 1) out.push(...leg(part, RIDE_STEP_M, BELOW_ACC));
    out.push(...wait(part[part.length - 1] ?? endPlatform, 4, BELOW_ACC));
    last = stop;
  }
  out.push(...leg([endPlatform, GRAND_CENTRAL_STAIR], WALK_STEP_M, 40));
  out.push(...leg([GRAND_CENTRAL_STAIR, ...FORTY_SECOND], WALK_STEP_M, STREET_ACC));
  return out;
}

/** Union Sq, down the wrong way to Astor Pl, and stays there. */
export function buildSimWrongWay(data: SubwayFile): SimSample[] {
  const shape = data.shapes["6"];
  const from = data.stopM["6"]["635"];
  const to = data.stopM["6"]["636"];
  // Downtown is rising distance along the 6's shape.
  const ride = shape.m.flatMap((m, i) => (m >= from && m <= to ? [shape.c[i]] : []));
  return [
    ...wait(PARK, 4, STREET_ACC),
    ...leg([PARK, [-73.9902, 40.7352], UNION_SQ_STAIR], WALK_STEP_M, STREET_ACC),
    ...leg([UNION_SQ_STAIR, ride[0]], WALK_STEP_M, 40),
    ...wait(ride[0], 6, BELOW_ACC),
    ...leg(ride, RIDE_STEP_M, BELOW_ACC),
    ...wait(ride[ride.length - 1], 4, BELOW_ACC),
  ];
}

/** The trip the pretend walk is meant to take: the uptown 6 from Union Sq to Grand Central, then 42 St. */
export function simTrip(data: SubwayFile): ActiveTrip {
  const st = (id: string) => {
    const f = data.stations?.features.find((x) => String(x.properties.id) === id);
    const c = (f?.geometry.coordinates ?? [0, 0]) as Pt;
    return { id, name: f?.properties.name ?? id, lon: c[0], lat: c[1] };
  };
  const stops = ["634", "633", "632", "631"].map(st);
  const end = FORTY_SECOND[FORTY_SECOND.length - 1];
  return {
    id: "sim:wrongway",
    destination: { label: "Bryant Park restroom", at: end },
    legs: [
      { kind: "enter", station: st("635") },
      { kind: "ride", mode: "subway", route: "6", stops: stops.map((s) => ({ at: [s.lon, s.lat] as Pt, text: s.name })) },
      { kind: "walk", portal: { lon: GRAND_CENTRAL_STAIR[0], lat: GRAND_CENTRAL_STAIR[1], label: "42 St stair" }, coords: [GRAND_CENTRAL_STAIR, ...FORTY_SECOND] },
    ],
  };
}

export type SimMode = "walk" | "wrongway";

/** Which pretend trip the page asked for, if any. */
export function simMode(search: string): SimMode | null {
  const v = new URLSearchParams(search).get("sim");
  return v === "walk" || v === "wrongway" ? v : null;
}

/** True when the page asked for a pretend trip. */
export function simRequested(search: string): boolean {
  return simMode(search) !== null;
}

/** A geolocation that plays the pretend trip once, then stays at the end. */
export function simGeo(load: () => Promise<SubwayFile> = () => fetch("/transit/subway.json").then((r) => r.json() as Promise<SubwayFile>), mode: SimMode = "walk"): Geo {
  const timers = new Map<number, ReturnType<typeof setInterval>>();
  let next = 1;
  return {
    watchPosition: (ok, fail) => {
      const id = next++;
      void load().then((data) => {
        if (mode === "wrongway") publishActiveTrip(simTrip(data));
        const samples = mode === "wrongway" ? buildSimWrongWay(data) : buildSimWalk(data);
        let i = 0;
        const emit = () => {
          const s = samples[Math.min(i++, samples.length - 1)];
          ok({ coords: { longitude: s.at[0], latitude: s.at[1], accuracy: s.accuracy, heading: s.course, speed: s.speed, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() } as GeolocationPosition);
          if (i >= samples.length) { clearInterval(timers.get(id)); timers.delete(id); }
        };
        emit();
        timers.set(id, setInterval(emit, SIM_TICK_MS));
      }).catch(() => fail?.({ code: 2, message: "sim unavailable" } as GeolocationPositionError));
      return id;
    },
    clearWatch: (id) => { clearInterval(timers.get(id)); timers.delete(id); },
  };
}
