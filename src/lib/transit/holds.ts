/**
 * Held trains from the live subway feed alone (PROJECT.md goal 5: "tell you
 * when a train is stuck and exactly where"). GTFS-realtime has no "held" flag,
 * so a train counts as held when, across feed refreshes, either:
 *  - its next-stop arrival time keeps slipping later (30 s or more, on two or
 *    more refreshes) while the vehicle still reports the same stop and status, or
 *  - the vehicle has reported STOPPED_AT / IN_TRANSIT_TO the same stop for
 *    3 minutes or more after that stop's predicted time passed.
 * A train waiting at its origin or standing at its last stop is never held:
 * trains wait there by design. The map and the line panel only show a hold
 * once it has lasted SHOW_AFTER_S, so a short wait at a signal stays quiet.
 *
 * Pure rule (`updateHold`) plus a page-lifetime memory per trip (`heldTrains`),
 * shared here so the map layer and the line panel see the same verdicts.
 */

/** The parts of a live trip the rule reads (features/transit LiveTrip is a superset). */
export interface HoldTrip {
  id: string;
  route: string;
  stops: Array<[string, number] | [string, number, number]>;
  /** Stop the vehicle reports. */
  at?: string;
  /** Vehicle current_status: 0 INCOMING_AT, 1 STOPPED_AT, 2 IN_TRANSIT_TO. */
  st?: number;
  /** The first stop is the trip's origin. */
  origin?: boolean;
}

/** Per-trip memory across feed refreshes. */
export type HoldState = { next: string; eta: number; at?: string; st?: number; slips: number; since: number; stillSince: number; feedAt: number };
export type HoldKind = "Delayed" | "Holding";
export type Hold = { state: HoldState; held: null | HoldKind; heldSince?: number };

/** Seconds an ETA must move later to count as a slip. */
export const SLIP_S = 30;
/** Seconds the vehicle reports the same stop and status, past its predicted time, before it counts as held. */
export const STILL_S = 180;
/** A hold is shown once it has lasted this long. */
export const SHOW_AFTER_S = STILL_S;

/** Update a trip's hold memory from one feed snapshot taken at `feedAt` (unix seconds). */
export function updateHold(prev: HoldState | undefined, trip: HoldTrip, feedAt: number): Hold {
  if (prev && prev.feedAt === feedAt) return judge(prev, trip, feedAt);
  const next = trip.stops.find(([, t]) => t > feedAt) ?? trip.stops[trip.stops.length - 1];
  const [nid, eta] = next;
  // The vehicle still reports the same stop and status: it has not moved on.
  const still = prev !== undefined && prev.at === trip.at && prev.st === trip.st;
  const same = still && prev.next === nid;
  const slipped = same && eta - prev.eta >= SLIP_S;
  const state: HoldState = {
    next: nid,
    eta,
    at: trip.at,
    st: trip.st,
    slips: slipped ? prev.slips + 1 : same ? prev.slips : 0,
    since: slipped && prev.slips === 0 ? prev.feedAt : same ? prev.since : feedAt,
    stillSince: still ? prev.stillSince : feedAt,
    feedAt,
  };
  return judge(state, trip, feedAt);
}

function judge(state: HoldState, trip: HoldTrip, feedAt: number): Hold {
  const last = trip.stops[trip.stops.length - 1]?.[0];
  const atOrigin = trip.origin && trip.at === trip.stops[0]?.[0];
  if (!trip.at || trip.at === last || atOrigin) return { state, held: null };
  const atT = trip.stops.find(([s]) => s === trip.at)?.[1];
  const still = (trip.st === 1 || trip.st === 2) && feedAt - state.stillSince >= STILL_S && atT !== undefined && feedAt - atT > 60;
  if (state.slips >= 2 || still) return { state, held: trip.st === 1 ? "Holding" : "Delayed", heldSince: still ? state.stillSince : state.since };
  return { state, held: null };
}

/** A held train, as the map and the line panel show it. */
export interface HeldTrain {
  tripId: string;
  route: string;
  kind: HoldKind;
  /** The stop the vehicle reports (platform id, e.g. "F32S"). */
  stop: string;
  /** Stopped at that stop (STOPPED_AT) rather than approaching it. */
  stopped: boolean;
  since: number;
  /** The trip's last stop (platform id): where it is heading. */
  toward: string;
}

const memory = new Map<string, HoldState>();
const verdicts = new WeakMap<object, Map<string, HeldTrain>>();

/**
 * Held trains in one live snapshot, keyed by trip id. Each snapshot is judged
 * once (the result is cached on the snapshot object), so every caller sees the
 * same answer and the memory advances once per refresh.
 */
export function heldTrains(live: { at: number; trips: HoldTrip[] } | undefined): Map<string, HeldTrain> {
  if (!live) return new Map();
  const hit = verdicts.get(live);
  if (hit) return hit;
  const out = new Map<string, HeldTrain>();
  for (const trip of live.trips) {
    const h = updateHold(memory.get(trip.id), trip, live.at);
    memory.set(trip.id, h.state);
    if (!h.held || h.heldSince === undefined || live.at - h.heldSince < SHOW_AFTER_S || !trip.at) continue;
    out.set(trip.id, { tripId: trip.id, route: trip.route, kind: h.held, stop: trip.at, stopped: trip.st === 1, since: h.heldSince, toward: trip.stops[trip.stops.length - 1][0] });
  }
  // Forget trips not seen for half an hour.
  if (memory.size > 5000) for (const [k, v] of memory) if (live.at - v.feedAt > 1800) memory.delete(k);
  verdicts.set(live, out);
  return out;
}
