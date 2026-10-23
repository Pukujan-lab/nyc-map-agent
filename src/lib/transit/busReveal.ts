import { useSyncExternalStore } from "react";

/** A trip, or a replacement shuttle, may name at most one page of bus routes. */
const BUS_REVEAL_CAP = 20;

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
