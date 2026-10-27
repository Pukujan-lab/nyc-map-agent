import type { Trip } from "./schema";

type LngLat = [number, number];

/** Shorter than this and you are already at the stop: the trip starts with the train or bus. */
export const WALK_FIRST_M = 80;

/**
 * Where "Use this route" walks you first on a train or bus trip (owner, 2026-10-27:
 * "instead of showing me a way to get to Elmhurst Av it showed me the line").
 * The walk legs before the first ride end at the station entrance or the bus
 * stop; null when there is no ride, or the walk there is too short to guide.
 */
export function walkToBoard(trip: Pick<Trip, "legs">): { at: LngLat; metres: number } | null {
  const ride = trip.legs.findIndex((l) => l.kind === "ride");
  if (ride < 0) return null;
  const walks = trip.legs.slice(0, ride).filter((l) => l.kind === "walk" || l.kind === "transfer");
  const metres = walks.reduce((s, l) => s + ("distanceM" in l ? l.distanceM : 0), 0);
  const last = walks.at(-1);
  if (!last || !("coords" in last) || metres < WALK_FIRST_M) return null;
  const at = last.coords[last.coords.length - 1];
  return { at: [at[0], at[1]], metres };
}
