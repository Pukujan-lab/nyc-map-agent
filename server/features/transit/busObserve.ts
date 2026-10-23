/**
 * Turns successive bus GTFS-rt vehicle positions into observed stop-to-stop
 * travel and stop dwell times. A bus reports the stop it is heading to; when
 * that changes from A to B the bus has just left A (taken as the midpoint of
 * the two reports). Two consecutive departures give one travel time, which
 * includes the dwell at the later stop (the estimator subtracts it again).
 * A run of stationary reports right before leaving a stop gives its dwell.
 */
export type BusPos = { id: string; route: string; dir: number | null; lon: number; lat: number; next: string | null; t: number };
export type BusObs = { at: number; route: string; dir: number | null; from: string; to: string; kind: "travel" | "dwell"; seconds: number };

type St = { route: string; dir: number | null; next: string; lon: number; lat: number; t: number; still?: number; left?: { stop: string; at: number } };

const MAX_GAP_S = 120, MIN_TRAVEL_S = 10, MAX_TRAVEL_S = 20 * 60, MAX_DWELL_S = 180, STILL_M = 10;
const metres = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
  Math.hypot((a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 111_320);

export class BusObserver {
  private s = new Map<string, St>();

  ingest(buses: BusPos[]): BusObs[] {
    const out: BusObs[] = [];
    for (const b of buses) {
      if (!b.next || !b.route) continue;
      const p = this.s.get(b.id);
      if (!p || p.route !== b.route || p.dir !== b.dir || b.t - p.t > MAX_GAP_S) {
        this.s.set(b.id, { route: b.route, dir: b.dir, next: b.next, lon: b.lon, lat: b.lat, t: b.t });
        continue;
      }
      if (b.t <= p.t) continue;
      if (b.next !== p.next) {
        const at = (p.t + b.t) / 2;
        if (p.still !== undefined) {
          const dwell = at - p.still;
          if (dwell > 0 && dwell <= MAX_DWELL_S) out.push({ at, route: b.route, dir: b.dir, from: p.next, to: p.next, kind: "dwell", seconds: dwell });
        }
        if (p.left) {
          const travel = at - p.left.at;
          if (travel >= MIN_TRAVEL_S && travel <= MAX_TRAVEL_S) out.push({ at, route: b.route, dir: b.dir, from: p.left.stop, to: p.next, kind: "travel", seconds: travel });
        }
        p.left = { stop: p.next, at };
        p.next = b.next;
        p.still = undefined;
      } else if (metres(p, b) < STILL_M) p.still ??= p.t;
      else p.still = undefined;
      p.lon = b.lon; p.lat = b.lat; p.t = b.t;
    }
    const newest = buses.reduce((m, b) => Math.max(m, b.t), 0);
    for (const [id, st] of this.s) if (newest - st.t > 900) this.s.delete(id);
    return out;
  }
}

/** One sample per segment and New York hour of week: the median of a run's observations. */
export function runMedians(obs: BusObs[], hourOfWeek: (at: number) => { dow: number; hour: number }) {
  const groups = new Map<string, { route: string; dir: number; from: string; to: string; kind: BusObs["kind"]; dow: number; hour: number; xs: number[] }>();
  for (const o of obs) {
    const { dow, hour } = hourOfWeek(o.at);
    const k = [o.route, o.dir ?? -1, o.from, o.to, o.kind, dow, hour].join("|");
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { route: o.route, dir: o.dir ?? -1, from: o.from, to: o.to, kind: o.kind, dow, hour, xs: [] }));
    g.xs.push(o.seconds);
  }
  return [...groups.values()].map(({ xs, ...g }) => {
    xs.sort((a, b) => a - b);
    const m = xs.length >> 1;
    return { ...g, n: xs.length, median: xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2 };
  });
}
