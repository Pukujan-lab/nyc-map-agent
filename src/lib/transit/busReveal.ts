import { useSyncExternalStore } from "react";

/** A trip, a replacement shuttle, or the lines a person picks may name at most this many bus routes. */
const BUS_REVEAL_CAP = 20;
export const MAX_PICKED_LINES = BUS_REVEAL_CAP;
export const DEFAULT_BUSES_PER_LINE = 3;
export const MAX_BUSES_PER_LINE = 10;

/** `Q1,B41` from the URL to a clean, deduplicated, capped list of route ids. */
export function parseBusLines(raw: string | null | undefined): string[] {
  const ids = (raw ?? "").split(",").map((r) => r.trim().toUpperCase()).filter(Boolean);
  return [...new Set(ids)].slice(0, MAX_PICKED_LINES);
}

/** A buses-per-line setting from the URL, kept inside 1..MAX_BUSES_PER_LINE. */
export function parseBusCap(raw: string | null | undefined): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_BUSES_PER_LINE) : DEFAULT_BUSES_PER_LINE;
}

/**
 * At most `cap` buses per line, the ones nearest `near`. Without a point the
 * first reports win, so the result is still stable.
 */
export function capPerLine<T extends { route: string; lon: number; lat: number }>(buses: readonly T[], cap: number, near?: { lon: number; lat: number } | null): T[] {
  const dist = (b: T) => (near ? (b.lon - near.lon) ** 2 + ((b.lat - near.lat) * 1.32) ** 2 : 0);
  const byLine = new Map<string, T[]>();
  for (const b of buses) {
    const key = b.route.toUpperCase();
    const list = byLine.get(key);
    if (list) list.push(b); else byLine.set(key, [b]);
  }
  return [...byLine.values()].flatMap((list) => [...list].sort((a, b) => dist(a) - dist(b)).slice(0, cap));
}

type Ride = { kind: string; mode?: string; route?: string };
type TripLike = { legs: Ride[]; alternatives?: Array<{ legs: Ride[] }> };

function rideRoutes(legs: Ride[]): string[] {
  return legs.flatMap((l) => (l.kind === "ride" && l.mode === "bus" && l.route ? [l.route.toUpperCase()] : []));
}

/** Bus routes on the trip, then bus routes named only on an alternative. */
export function busRoutesOfTrip(trip: TripLike): string[] {
  const ids = rideRoutes(trip.legs);
  for (const alt of trip.alternatives ?? []) ids.push(...rideRoutes(alt.legs));
  return [...new Set(ids)].slice(0, BUS_REVEAL_CAP);
}

/** A bus stop's "see them coming": its routes in focus around the stop, until its card closes. */
export type StopWatch = { routes: string[]; at: { lon: number; lat: number }; panelId: string };
let watch: StopWatch | null = null;
let tripRoutes: string[] | null = null;
let shuttleRoutes: string[] | null = null;
/** Alert id whose shuttle the person hid with Live buses off, until a different alert is focused. */
let shuttleHold: string | null = null;
let busToggle: ((on: boolean) => boolean) | null = null;
/** The trip, not the person, turned live buses on; closing the trip turns them back off. */
let tripTurnedOn = false;
type Pins = { trip: string[] | null; shuttle: string[] | null; watch?: StopWatch | null };
let snap: Pins = { trip: null, shuttle: null, watch: null };
const subs = new Set<() => void>();

function publish(): void {
  snap = { trip: tripRoutes, shuttle: shuttleRoutes, watch };
  subs.forEach((f) => f());
}

export function setTripBuses(routes: string[]): void {
  tripRoutes = routes.length ? routes.slice(0, BUS_REVEAL_CAP) : null;
  publish();
}

/** The transit layer registers how a trip turns the bus layer on or off (true when that changed it). Ask stays out of that feature. */
export function registerBusToggle(fn: ((on: boolean) => boolean) | null): void {
  busToggle = fn;
}

/** A trip names its buses and shows them. A trip with no bus clears the pin and leaves a chosen page alone. */
export function revealTripBuses(trip: TripLike): void {
  const routes = busRoutesOfTrip(trip);
  setTripBuses(routes);
  if (routes.length && busToggle?.(true)) tripTurnedOn = true;
}

/** A closed trip takes its buses with it: its pins, and the bus layer if the trip turned it on (owner, 2026-10-28). */
export function clearTripBuses(): void {
  setTripBuses([]);
  if (tripTurnedOn) busToggle?.(false);
  tripTurnedOn = false;
}

/** Returns false when this alert was explicitly hidden and the pin stays off. */
export function setShuttleBuses(alertId: string | null, routes: string[]): boolean {
  if (!alertId || !routes.length) {
    const changed = shuttleRoutes !== null || (!alertId && shuttleHold !== null);
    shuttleRoutes = null;
    if (!alertId) shuttleHold = null;
    if (changed) publish();
    return true;
  }
  if (shuttleHold === alertId) return false;
  const next = routes.slice(0, BUS_REVEAL_CAP);
  const same = shuttleHold === null && shuttleRoutes !== null && shuttleRoutes.length === next.length && next.every((r, i) => shuttleRoutes?.[i] === r);
  if (same) return true;
  shuttleHold = null;
  shuttleRoutes = next;
  publish();
  return true;
}

/** Show a stop's routes coming in (owner, 2026-10-27: the button showed nothing). Turns Live buses on. */
export function watchStopBuses(next: StopWatch): void {
  watch = { ...next, routes: next.routes.map((r) => r.toUpperCase()).slice(0, BUS_REVEAL_CAP) };
  publish();
  busToggle?.(true);
}

export function clearStopWatch(): void {
  if (!watch) return;
  watch = null;
  publish();
}

/** Live buses off: drop the trip and stop pins and keep this alert's shuttle hidden. */
export function holdShuttle(alertId: string | null): void {
  shuttleHold = alertId;
  shuttleRoutes = null;
  tripRoutes = null;
  watch = null;
  publish();
}

type BusShow = { why: "watch" | "shuttle" | "trip" | "page" | "off"; routes: string[] };

/** Trains stay. Buses stay only while their route is one of the routes still on. */
export function shownVehicles<T extends { system: string; route: string }>(vehicles: readonly T[], routes: readonly string[]): T[] {
  if (!routes.length) return vehicles.filter((v) => v.system !== "bus");
  const allow = new Set(routes.map((r) => r.toUpperCase()));
  return vehicles.filter((v) => v.system !== "bus" || allow.has(v.route.toUpperCase()));
}

/** A watched stop (the latest thing asked for) wins, then a shuttle, then a trip, then the picked lines. */
export function busesToShow(pageRoutes: string[], pins: Pins = snap): BusShow {
  if (pins.watch?.routes.length) return { why: "watch", routes: pins.watch.routes };
  if (pins.shuttle?.length) return { why: "shuttle", routes: pins.shuttle };
  if (pins.trip?.length) return { why: "trip", routes: pins.trip };
  if (pageRoutes.length) return { why: "page", routes: pageRoutes.slice(0, BUS_REVEAL_CAP) };
  return { why: "off", routes: [] };
}

export function useBusPins(): Pins {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => snap, () => snap);
}

/** Out of focus, a bus shows only this close to you (or the map centre, or the bus you follow). */
export const NEAR_BUS_RADIUS_M = 1200;

const metres = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
  Math.hypot((a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 111_320);

/**
 * Which buses draw (owner, 2026-10-27: buses stayed citywide after a follow).
 * A bus is in focus when you follow it or picked its route: picked routes show up to
 * `cap` per line nearest `near`. Routes that only came from a "buses near you" lookup
 * are out of focus and show only within `radiusM` of `near`. While you follow a bus,
 * every other bus is out of focus and `near` should be that bus.
 */
export function busesInFocus<T extends { id: string; route: string; lon: number; lat: number }>(
  buses: readonly T[],
  o: { routes: readonly string[]; nearOnly: boolean; cap: number; near: { lon: number; lat: number } | null; keep?: ReadonlySet<string>; radiusM?: number },
): T[] {
  const allow = new Set(o.routes.map((r) => r.toUpperCase()));
  const radius = o.radiusM ?? NEAR_BUS_RADIUS_M;
  const near = o.near;
  const inRoutes = buses.filter((b) => allow.has(b.route.toUpperCase()));
  const pool = o.nearOnly ? (near ? inRoutes.filter((b) => metres(near, b) <= radius) : []) : inRoutes;
  const kept = new Set(capPerLine(pool, o.cap, near).map((b) => b.id));
  return inRoutes.filter((b) => kept.has(b.id) || o.keep?.has(b.id));
}
