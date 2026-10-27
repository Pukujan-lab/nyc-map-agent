import { useSyncExternalStore } from "react";

/**
 * One way to change the view: Map, 3D or Street, at a place, facing a heading.
 * The Map · 3D · Street switch, the street mini map and "Back to street view"
 * all go through `showView`, and so can anything later that walks the camera
 * through stops (a transit tour). MapView carries each request out.
 * Memory only; nothing is written to storage here.
 */
export type ViewName = "map" | "3d" | "street";

export interface ViewPlace { lon: number; lat: number }

export interface ViewRequest {
  view: ViewName;
  /** Where to look; the current spot when left out. */
  place: ViewPlace | null;
  /** Compass heading in degrees; the current one when left out. */
  heading: number | null;
  /** Stand exactly on `place` in street view (going back to where you stood). */
  exact: boolean;
  nonce: number;
}

/** Where you last stood in street view, and which way you faced. */
export interface StreetSpot { lon: number; lat: number; heading: number }

let request: ViewRequest | null = null;
let spot: StreetSpot | null = null;
let nonce = 0;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => { subs.delete(f); };
};

export function showView(view: ViewName, place?: ViewPlace | null, heading?: number | null, opts: { exact?: boolean } = {}): void {
  request = { view, place: place ?? null, heading: heading ?? null, exact: opts.exact ?? false, nonce: ++nonce };
  notify();
}

/** Back to the spot and heading you left street view from. */
export function backToStreet(): void {
  if (spot) showView("street", spot, spot.heading, { exact: true });
}

export function setStreetSpot(next: StreetSpot | null): void {
  if (next === spot) return;
  spot = next;
  notify();
}

/** Non-hook reads, for one-off snapshots. */
export const viewRequest = (): ViewRequest | null => request;
export const streetSpot = (): StreetSpot | null => spot;

export function useViewRequest(): ViewRequest | null {
  return useSyncExternalStore(subscribe, () => request, () => null);
}

export function useStreetSpot(): StreetSpot | null {
  return useSyncExternalStore(subscribe, () => spot, () => null);
}

/** Test-only. */
export function resetViewChangeForTests(): void {
  request = null;
  spot = null;
}
