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

let tripRoutes: string[] | null = null;
let shuttleRoutes: string[] | null = null;
/** Alert id whose shuttle the person hid with Live buses off, until a different alert is focused. */
let shuttleHold: string | null = null;
let turnBusesOn: (() => void) | null = null;
let snap = { trip: null as string[] | null, shuttle: null as string[] | null };
const subs = new Set<() => void>();

function publish(): void {
  snap = { trip: tripRoutes, shuttle: shuttleRoutes };
  subs.forEach((f) => f());
}

export function setTripBuses(routes: string[]): void {
  tripRoutes = routes.length ? routes.slice(0, BUS_REVEAL_CAP) : null;
  publish();
}

/** The transit layer registers how a trip turns the bus layer on. Ask stays out of that feature. */
export function registerBusToggle(fn: (() => void) | null): void {
  turnBusesOn = fn;
}

/** A trip names its buses and shows them. A trip with no bus clears the pin and leaves a chosen page alone. */
export function revealTripBuses(trip: TripLike): void {
  const routes = busRoutesOfTrip(trip);
  setTripBuses(routes);
  if (routes.length) turnBusesOn?.();
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

/** Live buses off: drop the trip pin and keep this alert's shuttle hidden. */
export function holdShuttle(alertId: string | null): void {
  shuttleHold = alertId;
  shuttleRoutes = null;
  tripRoutes = null;
  publish();
}

type BusShow = { why: "shuttle" | "trip" | "page" | "off"; routes: string[] };

/** Trains stay. Buses stay only while their route is one of the routes still on. */
export function shownVehicles<T extends { system: string; route: string }>(vehicles: readonly T[], routes: readonly string[]): T[] {
  if (!routes.length) return vehicles.filter((v) => v.system !== "bus");
  const allow = new Set(routes.map((r) => r.toUpperCase()));
  return vehicles.filter((v) => v.system !== "bus" || allow.has(v.route.toUpperCase()));
}

/** Shuttle wins over a trip, and a trip wins over the corridor page. */
export function busesToShow(pageRoutes: string[], pins: { trip: string[] | null; shuttle: string[] | null } = snap): BusShow {
  if (pins.shuttle?.length) return { why: "shuttle", routes: pins.shuttle };
  if (pins.trip?.length) return { why: "trip", routes: pins.trip };
  if (pageRoutes.length) return { why: "page", routes: pageRoutes.slice(0, BUS_REVEAL_CAP) };
  return { why: "off", routes: [] };
}

export function useBusPins(): { trip: string[] | null; shuttle: string[] | null } {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => snap, () => snap);
}
