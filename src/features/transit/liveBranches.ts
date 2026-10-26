import { lineOf } from "@/lib/transit/selectedLine";
import { stationOf, type LiveTrip, type StaticSystem } from "./model";

/**
 * Which of a line's tracks its trains are on right now (owner, 2026-10-26). The static map holds every
 * path a route has ever been scheduled on, so the F showed both the 53 St and the 63 St tunnels. Live
 * trips say which stations follow which: track between two stations a train runs between is in use,
 * the rest of the line is faded, and a run between stations that is not on the line's own track (the F
 * on the G during a reroute) is drawn along the track it is really on, as a detour. Pure.
 */
type Pt = [number, number];
type Line = GeoJSON.Feature<GeoJSON.LineString, Record<string, unknown>>;
export interface LiveBranches { used: Line[]; unused: Line[]; detour: Line[] }

/** How near a track must pass a station's point to count as through it. */
const NEAR_M = 90;
/** Track past a line's last stop longer than this is a branch, not the terminal's tail. */
const TAIL_M = 800;
/** Most stations an express run passes between two stops. */
const SKIP = 14;

function distM(a: Pt, b: Pt): number {
  const k = Math.PI / 180;
  const x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * k);
  return Math.hypot(x, (b[1] - a[1]) * k) * 6371000;
}

/** A route's features are its shapes cut by grade; put each shape back together end to end. */
function joined(features: readonly Line[]): Pt[][] {
  const out: Pt[][] = [];
  for (const f of features) {
    const c = f.geometry.coordinates as Pt[];
    const last = out.at(-1);
    if (last && c.length && distM(last[last.length - 1], c[0]) < 1) last.push(...c.slice(1));
    else out.push([...c]);
  }
  return out;
}

/** The shape's vertices that pass one of these stations, in order, one per station visit. */
function hits(shape: Pt[], stations: ReadonlyMap<string, Pt>): Array<{ id: string; i: number }> {
  const out: Array<{ id: string; i: number; d: number }> = [];
  for (let i = 0; i < shape.length; i++) {
    for (const [id, at] of stations) {
      const d = distM(shape[i], at);
      if (d > NEAR_M) continue;
      const prev = out.at(-1);
      if (prev?.id === id) { if (d < prev.d) { prev.i = i; prev.d = d; } } else out.push({ id, i, d });
    }
  }
  return out;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const line = (coords: Pt[], props: Record<string, unknown>): Line => ({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } });

export function liveBranches(route: string, sys: StaticSystem, trips: readonly LiveTrip[]): LiveBranches | null {
  const own = sys.lines.features.filter((f) => lineOf(String(f.properties.route)) === route) as Line[];
  const mine = trips.filter((t) => lineOf(t.route) === route);
  // Station after station, as the live trains run them. Timing points inside a tunnel (R60) are not stations.
  const stationIds = new Set(sys.stations.features.map((f) => String(f.properties.id)));
  const pairs = new Set<string>();
  const served = new Set<string>();
  for (const t of mine) {
    const ids = t.stops.map(([s]) => stationOf("subway", s)).filter((id) => stationIds.has(id));
    ids.forEach((id, i) => { served.add(id); if (i && ids[i - 1] !== id) pairs.add(pairKey(ids[i - 1], id)); });
  }
  // No trains on the line right now (late night, a feed gap): nothing to say, so the line stays as drawn.
  if (!own.length || pairs.size < 2) return null;
  const at = new Map<string, Pt>();
  for (const f of sys.stations.features) {
    const id = String(f.properties.id);
    if (served.has(id)) at.set(id, f.geometry.coordinates as Pt);
  }
  const props = own[0].properties;
  const used: Line[] = [];
  const unused: Line[] = [];
  const covered = new Set<string>();
  for (const shape of joined(own)) {
    const h = hits(shape, at);
    if (h.length < 2) { unused.push(line(shape, props)); continue; }
    const pieces = h.slice(1).map((b, k) => ({ a: h[k], b, on: false }));
    // A train that runs express or skips a closed station still uses the track past the stations it skips.
    for (let k = 0; k < h.length; k++) {
      for (let j = k + 1; j < Math.min(h.length, k + 1 + SKIP); j++) {
        const key = pairKey(h[k].id, h[j].id);
        if (!pairs.has(key)) continue;
        covered.add(key);
        for (let p = k; p < j; p++) pieces[p].on = true;
      }
    }
    const cut = (from: number, to: number, on: boolean) => { if (to > from) (on ? used : unused).push(line(shape.slice(from, to + 1), props)); };
    // Past the first and last station the trains stop at: a short end is the terminal's tail track and goes with
    // its neighbour; a long one is a branch no train is on (the R's 2nd Avenue run, the F's 63 St tunnel).
    const tail = (from: number, to: number) => shape.slice(from, to + 1).reduce((d, c, i, a) => (i ? d + distM(a[i - 1], c) : 0), 0) <= TAIL_M;
    cut(0, h[0].i, pieces[0].on && tail(0, h[0].i));
    for (const p of pieces) cut(p.a.i, p.b.i, p.on);
    cut(h[h.length - 1].i, shape.length - 1, pieces[pieces.length - 1].on && tail(h[h.length - 1].i, shape.length - 1));
  }
  // Runs the line's own track does not have: find them on another route's track.
  const missing = [...pairs].filter((k) => !covered.has(k));
  const detour: Line[] = [];
  if (missing.length) {
    const others = new Map<string, Line[]>();
    for (const f of sys.lines.features as Line[]) {
      const r = lineOf(String(f.properties.route));
      if (r !== route) others.set(r, [...(others.get(r) ?? []), f]);
    }
    const left = new Set(missing);
    const ends = new Map([...at].filter(([id]) => missing.some((k) => k.split("|").includes(id))));
    for (const feats of others.values()) {
      if (!left.size) break;
      for (const shape of joined(feats)) {
        const h = hits(shape, ends);
        for (let k = 1; k < h.length; k++) {
          const key = pairKey(h[k - 1].id, h[k].id);
          if (!left.has(key)) continue;
          left.delete(key);
          detour.push(line(shape.slice(h[k - 1].i, h[k].i + 1), props));
        }
      }
    }
  }
  return { used, unused, detour };
}
