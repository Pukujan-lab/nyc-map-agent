/**
 * Keeps a live train from moving backward. Positions come from predicted
 * arrivals, and those predictions slip: a later ETA, a dropped stop or a fresh
 * feed snapshot can put the raw estimate behind where we already drew the
 * train. Within one trip, progress along the route never decreases. When the
 * raw estimate falls behind, the train slows down to reach the next stop at the
 * new ETA instead of snapping back. It never passes the next stop the feed
 * still lists until the feed drops it (confirmed departure). A new trip, a new
 * route or a large stop-list change (reroute) resets the state.
 */

/** Progress jump (m) behind the drawn train that counts as a reroute, not a late ETA. */
export const REROUTE_M = 2000;
/** Forget trips not seen for this long (s). */
const STALE_S = 600;

type State = { route: string; p: number; t: number; seen: number };

export type ProgressInput = {
  key: string;
  route: string;
  /** +1 when the trip runs toward increasing shape metres, -1 otherwise. */
  forward: number;
  /** Raw estimated position along the shape (m). */
  m: number;
  /** Position (m) of the next stop the feed still lists; the train may not pass it. */
  holdM?: number;
  /** Predicted arrival at that stop (unix s). */
  holdEta?: number;
};

export class ProgressTracker {
  private s = new Map<string, State>();

  /** Monotonic position along the shape (m) for `now`. */
  update(inp: ProgressInput, now: number): number {
    const f = inp.forward >= 0 ? 1 : -1;
    let target = f * inp.m;
    const cap = inp.holdM !== undefined ? f * inp.holdM : Infinity;
    target = Math.min(target, cap);
    const prev = this.s.get(inp.key);
    let p = target;
    if (prev && prev.route === inp.route && prev.p - target < REROUTE_M && prev.p - cap < REROUTE_M) {
      if (target < prev.p) {
        // Behind the drawn train: creep toward the next stop so we arrive at the new ETA.
        const dt = Math.max(0, now - prev.t);
        const left = Math.max(1, (inp.holdEta ?? now) - prev.t);
        const room = Math.max(0, cap - prev.p);
        p = prev.p + (Number.isFinite(room) ? room * Math.min(1, dt / left) : 0);
        p = Math.min(p, Math.max(cap, prev.p));
      }
      p = Math.max(p, prev.p);
    }
    this.s.set(inp.key, { route: inp.route, p, t: now, seen: now });
    if (this.s.size > 64) this.prune(now);
    return f * p;
  }

  forget(key: string) {
    this.s.delete(key);
  }

  prune(now: number) {
    for (const [k, v] of this.s) if (now - v.seen > STALE_S) this.s.delete(k);
  }
}

/** Shared tracker for the map so every view sees the same monotonic trains. */
export const liveProgress = new ProgressTracker();
