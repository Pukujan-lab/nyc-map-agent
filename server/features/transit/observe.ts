/**
 * Turns successive GTFS-rt snapshots into observed segment travel and dwell
 * times. Feeds drop a stop once the train leaves it, so when a stop vanishes
 * from a trip we take its last predicted arrival/departure as what happened.
 * Two consecutive vanished stops give one travel time (arr B - dep A).
 */
import type { TransitTrip } from "./routes";

export type SegmentObs = {
  observedAt: number;
  system: string;
  route: string;
  dir: number | null;
  from: string;
  to: string;
  kind: "travel" | "dwell";
  seconds: number;
  tripId: string;
};

type Last = { stop: string; arr: number; dep: number };
type TripState = { route: string; dir: number | null; stops: Map<string, Last>; order: string[]; passed?: Last; seen: number };

const MAX_TRAVEL_S = 30 * 60;
const MAX_DWELL_S = 10 * 60;

export class SegmentObserver {
  private trips = new Map<string, TripState>();
  constructor(readonly system: string) {}

  /** Feed one snapshot (unix seconds `at`); returns the observations it completes. */
  ingest(trips: TransitTrip[], at: number): SegmentObs[] {
    const out: SegmentObs[] = [];
    const live = new Set<string>();
    for (const t of trips) {
      live.add(t.id);
      const cur = new Map<string, Last>(t.stops.map(([stop, arr, dep]) => [stop, { stop, arr, dep: dep ?? arr }]));
      const prev = this.trips.get(t.id);
      if (prev && prev.route === t.route) {
        // Stops before the first still-listed one have been passed, in order.
        const firstLive = prev.order.findIndex((s) => cur.has(s));
        const gone = firstLive < 0 ? [] : prev.order.slice(0, firstLive);
        let last = prev.passed;
        for (const s of gone) {
          const p = prev.stops.get(s)!;
          if (p.arr > at + 60) break; // dropped before it was due: a reroute/skip, not an observation
          const dwell = p.dep - p.arr;
          if (dwell > 0 && dwell < MAX_DWELL_S) out.push(this.obs(t, at, s, s, "dwell", dwell));
          if (last) {
            const travel = p.arr - last.dep;
            if (travel > 0 && travel < MAX_TRAVEL_S) out.push(this.obs(t, at, last.stop, s, "travel", travel));
          }
          last = p;
        }
        prev.passed = last;
        prev.stops = cur;
        prev.order = [...cur.keys()];
        prev.seen = at;
      } else {
        this.trips.set(t.id, { route: t.route, dir: t.dir, stops: cur, order: [...cur.keys()], seen: at });
      }
    }
    for (const [id, s] of this.trips) if (!live.has(id) && at - s.seen > 900) this.trips.delete(id);
    return out;
  }

  private obs(t: TransitTrip, at: number, from: string, to: string, kind: SegmentObs["kind"], seconds: number): SegmentObs {
    return { observedAt: at, system: this.system, route: t.route, dir: t.dir, from, to, kind, seconds, tripId: t.id };
  }
}
