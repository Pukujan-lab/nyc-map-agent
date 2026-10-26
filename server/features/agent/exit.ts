/**
 * "Which way out for the Empire State Building?": the station near the place
 * (or the one named), its street exit closest to the place, said as a corner,
 * and the walk from that exit. The client draws all of it, so the reply can
 * stay one line.
 */
import { formatStreetText } from "../../../src/lib/streetName";
import type { LngLatTuple } from "../../../src/features/agent/schema";
import { elevatorStatus, routeWalk, type Place, type WalkResult } from "./services";
import { matchStation } from "./places";
import { portalFor, safe, straight } from "./trip";
import { distM, openDataEntrances, type Station, type StationEntrances } from "./transit";

export interface StationExit {
  station: Station;
  destination: Place;
  exit: { at: LngLatTuple; label: string; elevatorOnly: boolean; outage: string | null };
  walk: WalkResult;
}

export interface ExitDeps {
  entrances?: StationEntrances;
  walk?: (a: LngLatTuple, b: LngLatTuple) => Promise<WalkResult>;
  outages?: (station: string) => Promise<string[]>;
}

/** Farther than this from the place and no station counts as "near" it. */
const NEAR_M = 1200;

/** The named station when it matches, else the station nearest the place. */
export function pickStation(stations: Station[], dest: LngLatTuple, named?: string): Station | null {
  if (named) {
    const exact = matchStation(named, stations);
    if (exact) return exact;
  }
  let best: { s: Station; d: number } | null = null;
  for (const s of stations) {
    const d = distM(s.at, dest);
    if (d <= NEAR_M && (!best || d < best.d)) best = { s, d };
  }
  return best?.s ?? null;
}

/** "NE exit on West 34 Street (elevator)" → "NE corner, West 34 Street". */
export function cornerLabel(portalLabel: string): string {
  const m = /^([NSEW]{1,2}) (?:exit|entrance)(?: on (.+?))?(?: \(elevator\))?$/.exec(portalLabel);
  if (!m) return portalLabel;
  return m[2] ? `${m[1]} corner, ${formatStreetText(m[2])}` : `${m[1]} corner`;
}

export async function stationExit(dest: Place, named: string | undefined, deps: ExitDeps = {}): Promise<StationExit | null> {
  const src = deps.entrances ?? openDataEntrances;
  const st = pickStation(await src.stations(), dest.at, named);
  if (!st) return null;
  const [ents, outages] = await Promise.all([safe(src.entrances(st.complexId), []), safe((deps.outages ?? elevatorStatus)(st.name), [] as string[])]);
  const p = await portalFor(st, ents, dest.at, "exit", outages);
  const at: LngLatTuple = [p.lon, p.lat];
  const walk = await safe((deps.walk ?? routeWalk)(at, dest.at), straight(at, dest.at));
  return { station: st, destination: dest, exit: { at, label: cornerLabel(p.label), elevatorOnly: p.elevatorOnly, outage: p.outage }, walk };
}
