import { useSyncExternalStore } from "react";

/**
 * The next step of a trip under way, shown in the walking card while you walk to
 * the station or stop: "Then the M at Elmhurst Av" and a button to go on to it.
 */
export interface TripStep { then: string; action: string; go: () => void }

let step: TripStep | null = null;
const subs = new Set<() => void>();

export function setTripStep(next: TripStep | null): void {
  step = next;
  subs.forEach((f) => f());
}

export function useTripStep(): TripStep | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => step, () => null);
}
