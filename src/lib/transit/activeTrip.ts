import { useSyncExternalStore } from "react";

/**
 * The trip the person is looking at right now (shown, opened or previewed by
 * Smart mode), so other features can prepare for it without importing the
 * agent feature. Structural on purpose: core does not import feature types.
 * Memory only; nothing is written to storage here.
 */
export type TripPoint = [number, number];
export interface ActiveTripLeg {
  kind: string;
  mode?: string;
  coords?: TripPoint[];
  /** Stops ridden (alighting stop included), as the planner named and placed them. */
  stops?: Array<{ at: TripPoint; text: string }>;
  route?: string;
  label?: string;
  station?: { id: string; name: string; lon: number; lat: number };
  portal?: { lon: number; lat: number; label: string };
}
export interface ActiveTrip {
  id: string;
  destination: { label: string; at: TripPoint };
  legs: ActiveTripLeg[];
}

let current: ActiveTrip | null = null;
const subs = new Set<() => void>();

export function publishActiveTrip(trip: ActiveTrip | null): void {
  if (trip === current) return;
  current = trip;
  subs.forEach((f) => f());
}

export function getActiveTrip(): ActiveTrip | null {
  return current;
}

export function useActiveTrip(): ActiveTrip | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
    () => null,
  );
}
