/**
 * Before exit help points at an exit, it checks you are at that station:
 * from your shared location when you have shared it, or from your own "I'm
 * here". Nothing here asks the browser for a position; that waits for a tap.
 */
import { metres, type Pt, type Station } from "./exits";
import type { SharedLocation } from "@/lib/geo/sharedLocation";

/** Further than this from the station's centre and you are not at it. Big stations span ~200 m. */
export const AT_STATION_M = 250;

export type Where =
  /** Location not shared and not confirmed: ask. */
  | { kind: "ask"; blocked: boolean }
  | { kind: "finding" }
  /** Shared location says you are elsewhere; `nearest` is the station by you, if any. */
  | { kind: "far"; metres: number; nearest: Station | null }
  /** At the station. `from` is your position when the shared location agrees, for the line to the exit. */
  | { kind: "here"; from: Pt | null; toExitM: number | null };

export function whereYouAre(p: {
  station: Station;
  exitAt: Pt | null;
  shared: Pick<SharedLocation, "status" | "coords">;
  /** You said "I'm here" for this station. */
  confirmed: boolean;
  nearest: Station | null;
}): Where {
  const me: Pt | null = p.shared.status === "on" && p.shared.coords ? [p.shared.coords.lon, p.shared.coords.lat] : null;
  if (me) {
    const d = metres(me, p.station.at);
    if (d <= AT_STATION_M) return { kind: "here", from: me, toExitM: p.exitAt ? Math.round(metres(me, p.exitAt)) : null };
    // Underground the last fix can be stale, so your word wins; there is just no line from you.
    if (p.confirmed) return { kind: "here", from: null, toExitM: null };
    return { kind: "far", metres: Math.round(d), nearest: p.nearest && p.nearest.id !== p.station.id ? p.nearest : null };
  }
  if (p.confirmed) return { kind: "here", from: null, toExitM: null };
  if (p.shared.status === "asking") return { kind: "finding" };
  return { kind: "ask", blocked: p.shared.status === "denied" || p.shared.status === "unavailable" };
}

/** "350 m" or "1.2 km". */
export function distanceLabel(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
