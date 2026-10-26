/**
 * Exit packs: what the station-to-exit flow needs with no network, saved on
 * this device only (localStorage, a few kB per station). One pack per
 * station: its exits (point, corner name, MTA equipment text, nearby
 * landmarks), the track bearing at the platform, and a small street sketch
 * around it. Plus the destination and the last known elevator/escalator
 * status with the time it was fetched. No layouts, no positions, no history.
 */
import type { ActiveTrip } from "@/lib/transit/activeTrip";
import { matchUnit, type StreetUnit } from "@/lib/transit/equipment";
import { alongPlatform, directionAt, trainEndOf } from "./cues";
import { metres, nearestStation, rankExits, stationEntrances, type Exit, type ExitPlace, type Pt, type Station, type SubwayStatic } from "./exits";

export interface PackExit extends Exit {
  /** MTA equipment id and its own wording, when an elevator/escalator matched. */
  unit: { id: string; serving: string } | null;
  /** True when the corner name was worked out from the map, not printed by the MTA. */
  cornerApprox: boolean;
}

export interface ExitPack {
  station: Station;
  exits: PackExit[];
  /** Bearing of travel of the arriving train at this station; null without a ride line. */
  trackBearing: number | null;
  /** Named streets within ~150 m, simplified, for an offline sketch. */
  sketch: Array<{ name: string; coords: Pt[] }>;
  /** Basemap tiles saved for an offline map of the station area (in the browser's Cache Storage). */
  tiles?: { count: number; bytes: number; at: number };
}

export interface OutageStatus {
  /** When the status was fetched (ms). */
  at: number;
  /** Equipment ids out of service then. */
  out: string[];
}

export interface PackStore {
  v: 3;
  savedAt: number;
  destination: { label: string; at: Pt } | null;
  /** The trip's last walk, from the final station to the destination (street route), when the trip has one. */
  walkOut?: Pt[];
  packs: ExitPack[];
  status: OutageStatus | null;
}

const KEY = "nyc-map:underground:v3";
const SKETCH_M = 150;

/** Stations a trip gets off at: every subway ride's end (transfers and the destination), with that ride's line. */
export function tripStations(sys: SubwayStatic, trip: ActiveTrip): Array<{ station: Station; line: Pt[] | null }> {
  const out: Array<{ station: Station; line: Pt[] | null }> = [];
  trip.legs.forEach((l, i) => {
    if (l.kind !== "ride" || (l.mode ?? "subway") !== "subway" || !l.coords?.length) return;
    // Prefer the exit leg's station when it follows this ride directly.
    const next = trip.legs.slice(i + 1).find((x) => x.kind !== "transfer");
    const end = l.coords[l.coords.length - 1];
    const st = next?.kind === "exit" && next.station ? { id: next.station.id, name: next.station.name, at: [next.station.lon, next.station.lat] as Pt } : nearestStation(sys, end, 150);
    if (st && !out.some((o) => o.station.id === st.id)) out.push({ station: { id: st.id, name: st.name, at: st.at }, line: l.coords.length >= 2 ? l.coords : null });
  });
  return out;
}

/** Every station the trip's subway rides stop at, in order, starting where it boards. */
export function tripStops(sys: SubwayStatic, trip: ActiveTrip): Station[] {
  const out: Station[] = [];
  const add = (st: Station | null) => {
    if (st && out[out.length - 1]?.id !== st.id) out.push({ id: st.id, name: st.name, at: st.at });
  };
  for (const l of trip.legs) {
    if (l.kind === "enter" && l.station) add({ id: l.station.id, name: l.station.name, at: [l.station.lon, l.station.lat] });
    if (l.kind !== "ride" || (l.mode ?? "subway") !== "subway") continue;
    if (!out.length && l.coords?.length) add(nearestStation(sys, l.coords[0], 150));
    for (const s of l.stops ?? []) add(nearestStation(sys, s.at, 150));
  }
  return out;
}

/** Keep only named street lines near the station, with coordinates rounded to ~1 m. */
export function clipSketch(lines: Array<{ name: string; coords: Pt[] }>, center: Pt, radiusM = SKETCH_M): ExitPack["sketch"] {
  const r5 = (p: Pt): Pt => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
  const kx = 111_320 * Math.cos((center[1] * Math.PI) / 180);
  // Segments passing within the radius (an OSM street may have no vertex near the station).
  const segNear = (a: Pt, b: Pt) => {
    const ax = (a[0] - center[0]) * kx, ay = (a[1] - center[1]) * 111_320;
    const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * 111_320;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    return Math.hypot(ax + t * dx, ay + t * dy) <= radiusM;
  };
  const out: ExitPack["sketch"] = [];
  for (const l of lines) {
    let run: Pt[] = [];
    for (let i = 1; i < l.coords.length; i++) {
      if (segNear(l.coords[i - 1], l.coords[i])) {
        if (!run.length) run.push(r5(l.coords[i - 1]));
        run.push(r5(l.coords[i]));
      } else if (run.length) {
        out.push({ name: l.name, coords: run });
        run = [];
      }
    }
    if (run.length >= 2) out.push({ name: l.name, coords: run });
  }
  return out.slice(0, 24);
}

export function buildPack(
  sys: SubwayStatic,
  units: StreetUnit[],
  st: Station,
  line: Pt[] | null,
  dest: Pt | null,
  map: { placeAt?: (at: Pt) => ExitPlace; lines?: Array<{ name: string; coords: Pt[] }> } = {},
): ExitPack {
  // A complex spans several GTFS ids (Times Sq: 127/725/902/A27/R16); the equipment list names them all.
  const stopIds = [
    ...new Set([st.id, ...(sys.entrances?.features ?? []).filter((f) => f.properties.name === st.name && metres(f.geometry.coordinates as Pt, st.at) <= 300).map((f) => String(f.properties.id))]),
  ];
  const exits = rankExits(st, stationEntrances(sys, st), dest, map.placeAt, (at) => ({ trainEnd: trainEndOf(line, st.at, at), alongM: alongPlatform(line, st.at, at) })).map((e): PackExit => {
    const unit = matchUnit(units, { kind: e.kind, stopIds, corner: e.corner, streets: e.streets });
    // Prefer the MTA's own street and corner words when a unit matches.
    return unit
      ? { ...e, streets: unit.streets.slice(0, 2) as [string, string], corner: unit.corner, unit: { id: unit.id, serving: unit.serving }, cornerApprox: false }
      : { ...e, unit: null, cornerApprox: e.corner !== null };
  });
  const track = directionAt(line, st.at);
  return { station: st, exits, trackBearing: track && track.offM <= 150 ? track.bearing : null, sketch: clipSketch(map.lines ?? [], st.at) };
}

/**
 * Packs for a trip (every station it gets off at, destination last) or, without
 * one, for the station nearest `near`.
 */
export function buildStore(
  sys: SubwayStatic,
  units: StreetUnit[],
  p: { trip: ActiveTrip | null; near: Pt | null; placeAt?: (at: Pt) => ExitPlace; lines?: Array<{ name: string; coords: Pt[] }>; now?: number; status?: OutageStatus | null },
): PackStore | null {
  const dest = p.trip ? { label: p.trip.destination.label, at: p.trip.destination.at } : null;
  const stations = p.trip ? tripStations(sys, p.trip) : [];
  if (!stations.length && p.near) {
    const st = nearestStation(sys, p.near);
    if (st) stations.push({ station: { id: st.id, name: st.name, at: st.at }, line: null });
  }
  if (!stations.length) return null;
  const lastWalk = p.trip ? [...p.trip.legs].reverse().find((l) => l.kind === "walk" && (l.coords?.length ?? 0) >= 2) : undefined;
  return {
    v: 3,
    savedAt: p.now ?? Date.now(),
    destination: dest,
    ...(lastWalk?.coords ? { walkOut: lastWalk.coords.map((c) => [c[0], c[1]] as Pt) } : {}),
    packs: stations.map((s) => buildPack(sys, units, s.station, s.line, dest?.at ?? null, p)),
    status: p.status ?? null,
  };
}

/**
 * The walk from the chosen exit to the destination: the trip's own street
 * route from the point nearest the exit onward, or nothing when this station
 * is not where the walk starts (a transfer) or there is no destination.
 */
export function walkFromExit(store: PackStore | null, pack: ExitPack, exitAt: Pt): Pt[] | null {
  const dest = store?.destination;
  if (!dest) return null;
  const last = store.packs[store.packs.length - 1];
  if (last?.station.id !== pack.station.id) return null;
  const route = store.walkOut ?? [];
  if (route.length < 2 || metres(route[0], pack.station.at) > 400) return [exitAt, dest.at];
  let i = 0;
  route.forEach((c, j) => { if (metres(c, exitAt) < metres(route[i], exitAt)) i = j; });
  return [exitAt, ...route.slice(i)];
}

export function packFor(store: PackStore | null, stationId: string | null): ExitPack | null {
  return store?.packs.find((p) => p.station.id === stationId) ?? null;
}

/** Outage words for the chosen exit, always with how old the status is. */
export function outageLabel(status: OutageStatus | null, unitId: string | null, now: number, staleMs = 15 * 60_000): string | null {
  if (!unitId) return null;
  if (!status) return "Elevator/escalator status not known";
  const min = Math.max(0, Math.floor((now - status.at) / 60_000));
  const age = min < 1 ? "as of just now" : `as of ${min} min ago`;
  const out = status.out.includes(unitId);
  if (now - status.at > staleMs) return `${out ? "Was out of service" : "Was working"} (${age}; may have changed)`;
  return `${out ? "Out of service" : "Working"} (${age})`;
}

export function saveStore(s: PackStore | null, store: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): void {
  try {
    if (!store) return;
    if (s) store.setItem(KEY, JSON.stringify(s));
    else store.removeItem(KEY);
  } catch {
    /* private mode or full storage: the helper still works for this session */
  }
}

export function loadStore(store: Pick<Storage, "getItem"> | null = safeStorage()): PackStore | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PackStore;
    return s && s.v === 3 && Array.isArray(s.packs) ? s : null;
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
