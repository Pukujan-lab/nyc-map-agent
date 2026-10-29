import type { ActiveTrip } from "@/lib/transit/activeTrip";
import { angleDiff, bearing, metres, type Pt, type Station, type SubwayStatic } from "./exits";

/**
 * Two mistakes people make on the subway, read from location fixes while a
 * trip is on screen. Pure, for tests.
 * - Wrong direction: once you have boarded, you get more than WRONG_DIR_M
 *   farther from the stop you get off at than the closest you have been.
 *   Heading back toward it again clears the warning.
 * - Wrong exit: you come back up (the first sharp fix after vague ones below
 *   ground) more than WRONG_EXIT_M from the exit the trip planned.
 */
export const WRONG_DIR_M = 400;
export const WRONG_EXIT_M = 150;
/** Within this of the boarding station counts as having boarded. */
const BOARD_M = 300;
/** Fixes vaguer than this say nothing about where the train is. */
const USABLE_M = 200;
/** Moving at least this far between fixes gives a direction of travel. */
const TRAVEL_MIN_M = 30;

export interface DirState {
  boarded: boolean;
  best: number;
  last: Pt | null;
  travel: number | null;
  wrong: boolean;
}

export const initialDir: DirState = { boarded: false, best: Number.POSITIVE_INFINITY, last: null, travel: null, wrong: false };

/** The next state for one fix at `here` (`accuracy` metres) on a ride from `from` to `to`. */
export function dirStep(s: DirState, from: Pt, to: Pt, here: Pt, accuracy: number | null): DirState {
  if ((accuracy ?? 0) > USABLE_M) return s;
  const d = metres(here, to);
  if (!s.boarded) return metres(here, from) <= BOARD_M ? { ...s, boarded: true, best: d, last: here } : s;
  const moved = s.last ? metres(s.last, here) : 0;
  const travel = s.last && moved >= TRAVEL_MIN_M ? bearing(s.last, here) : s.travel;
  const last = moved >= TRAVEL_MIN_M || !s.last ? here : s.last;
  const best = Math.min(s.best, d);
  // Heading toward the stop again (you crossed over) clears it, before you are back near your closest.
  const towards = travel !== null && moved >= TRAVEL_MIN_M && Math.abs(angleDiff(travel, bearing(here, to))) < 60;
  const wrong = towards ? false : s.wrong || d - best > WRONG_DIR_M;
  return { boarded: true, best, last, travel, wrong };
}

/** The station ahead on `route` in the way you are travelling, if there is one. */
export function nextStationAhead(sys: SubwayStatic, route: string, here: Pt, travel: number): Station | null {
  let best: (Station & { d: number }) | null = null;
  for (const f of sys.stations.features) {
    const routes = String((f.properties as { routes?: string }).routes ?? "").split(" ");
    if (!routes.includes(route)) continue;
    const at = f.geometry.coordinates as Pt;
    const d = metres(here, at);
    if (d < 150 || Math.abs(angleDiff(bearing(here, at), travel)) > 50) continue;
    if (!best || d < best.d) best = { id: String(f.properties.id), name: f.properties.name, at: [at[0], at[1]], d };
  }
  return best;
}

/** "This train is going downtown. Get off at Astor Pl and cross over." */
export function wrongDirectionLine(travel: number | null, next: string | null): string {
  const way = travel === null ? "the other way" : Math.abs(angleDiff(travel, 0)) <= 90 ? "uptown" : "downtown";
  return `This train is going ${way}. Get off at ${next ?? "the next stop"} and cross over.`;
}

/** True on the first sharp fix after at least three vague ones: you just came up. */
export function justSurfaced(accuracies: Array<number | null>): boolean {
  const last = accuracies.at(-1);
  const prev = accuracies.at(-2);
  if (last == null || last > 25 || (prev != null && prev <= 25)) return false;
  return accuracies.filter((a) => (a ?? 0) >= 60).length >= 3;
}

/** You came up this far from the planned exit, if it is too far. */
export function wrongExit(planned: Pt | null, here: Pt): number | null {
  if (!planned) return null;
  const d = metres(planned, here);
  return d > WRONG_EXIT_M ? Math.round(d) : null;
}

/** Where the trip planned you to come up: the exit it names, else the start of the walk after the ride. */
export function plannedExit(trip: ActiveTrip): Pt | null {
  const ride = trip.legs.findIndex((l) => l.kind === "ride");
  for (const l of trip.legs.slice(ride + 1)) {
    if (l.portal) return [l.portal.lon, l.portal.lat];
    if (l.kind === "walk" && l.coords?.length) return l.coords[0];
  }
  return null;
}
