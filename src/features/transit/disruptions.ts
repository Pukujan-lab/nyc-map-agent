/**
 * Disruptions from real MTA feed data only: which track a rerouted trip rides,
 * whether a train is held, where an alert sits on the map, and a plain-English
 * summary of each alert built by fixed rules (no model calls). When the rules
 * cannot resolve every station they name, callers fall back to the MTA header.
 */
import { sliceBetween, stationOf, trackFor, type LiveTrip, type StaticSystem } from "./model";



export type AlertEntity = { route: string; stop: string; dir?: number };
export type DisruptionAlert = {
  id: string;
  kind: "planned" | "delay" | "notice";
  type: string;
  reroute: boolean;
  text: string;
  description?: string;
  period?: string;
  start?: number;
  end?: number;
  agency: string;
  routes: string[];
  stops: string[];
  ents?: AlertEntity[];
};

type Station = { id: string; name: string; routes: string[]; c: [number, number] };
const cache = new WeakMap<StaticSystem, { list: Station[]; byId: Map<string, Station> }>();
function stationsOf(sys: StaticSystem) {
  let s = cache.get(sys);
  if (!s) {
    const list = sys.stations.features.map((f) => ({
      id: String(f.properties.id),
      name: String(f.properties.name),
      routes: String(f.properties.routes ?? "").split(/[\s,]+/).filter(Boolean),
      c: f.geometry.coordinates as [number, number],
    }));
    s = { list, byId: new Map(list.map((x) => [x.id, x])) };
    cache.set(sys, s);
  }
  return s;
}
export const stationName = (sys: StaticSystem, stop: string) => stationsOf(sys).byId.get(stationOf(sys.system, stop))?.name ?? "";

// ---------------------------------------------------------------- track choice

/** Path the trip actually takes through its served stops, hop by hop on the right track. */
export function tripPath(sys: StaticSystem, trip: Pick<LiveTrip, "route" | "stops">): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i < trip.stops.length; i++) {
    const a = trip.stops[i - 1][0], b = trip.stops[i][0];
    const r = trackFor(sys, trip.route, a, b);
    if (!r) continue;
    const seg = sliceBetween(sys, r, stationOf(sys.system, a), stationOf(sys.system, b));
    if (seg) out.push(...(out.length ? seg.slice(1) : seg));
  }
  return out;
}

// ---------------------------------------------------------------- held trains

/** Per-trip memory across feed refreshes. */
export type HoldState = { next: string; eta: number; at?: string; st?: number; slips: number; since: number; stillSince: number; feedAt: number };
export type Hold = { state: HoldState; held: null | "Delayed" | "Holding"; heldSince?: number };
const SLIP = 30; // seconds an ETA must move later to count as a slip
const STILL = 180; // seconds the vehicle reports the same stop and status with no progress

/**
 * Update a trip's hold memory from one feed snapshot. Held when the next-stop
 * ETA has slipped later on two or more refreshes in a row while the vehicle
 * reports the same stop, or when the vehicle has reported STOPPED_AT /
 * IN_TRANSIT_TO the same stop for 3+ minutes after its predicted time passed.
 */
export function updateHold(prev: HoldState | undefined, trip: LiveTrip, feedAt: number): Hold {
  const next = trip.stops.find(([, t]) => t > feedAt) ?? trip.stops[trip.stops.length - 1];
  const [nid, eta] = next;
  if (prev && prev.feedAt === feedAt) return judge(prev, trip, feedAt);
  const same = prev && prev.next === nid && prev.at === trip.at && prev.st === trip.st;
  const slipped = same && eta - prev.eta >= SLIP;
  const state: HoldState = {
    next: nid,
    eta,
    at: trip.at,
    st: trip.st,
    slips: slipped ? prev.slips + 1 : same ? prev.slips : 0,
    since: slipped && prev.slips === 0 ? prev.feedAt : same ? prev.since : feedAt,
    stillSince: same ? prev.stillSince : feedAt,
    feedAt,
  };
  return judge(state, trip, feedAt);
}
function judge(state: HoldState, trip: LiveTrip, feedAt: number): Hold {
  const atT = trip.at ? trip.stops.find(([s]) => s === trip.at)?.[1] : undefined;
  const stuck = (trip.st === 1 || trip.st === 2) && feedAt - state.stillSince >= STILL && atT !== undefined && feedAt - atT > 60;
  if (state.slips >= 2 || stuck) return { state, held: trip.st === 1 ? "Holding" : "Delayed", heldSince: stuck ? state.stillSince : state.since };
  return { state, held: null };
}

// ---------------------------------------------------------------- alert placement

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "av").replace(/\bave\b/g, "av").replace(/[^a-z0-9]+/g, " ").trim();

/** A station named in alert text, preferring ones on the alert's routes. Exact (normalized) name match only. */
function resolveStation(sys: StaticSystem, name: string, routes: string[]): Station | undefined {
  const n = norm(name.replace(/\[[^\]]+\]/g, "").replace(/\bstations?$/i, ""));
  if (!n) return undefined;
  const hits = stationsOf(sys).list.filter((s) => norm(s.name) === n);
  return hits.find((s) => s.routes.some((r) => routes.includes(r))) ?? (hits.length === 1 ? hits[0] : undefined);
}

export type Direction = { label: string; track?: "express" | "local" };
/** Direction words from the alert text: "<X>-bound", uptown/downtown, Manhattan-bound, express/local track. */
export function parseDirection(text: string): Direction | null {
  const bound = /((?:[A-Z0-9][\w.'/-]*\s?){1,4}-bound)/.exec(text)?.[1]?.trim();
  const ud = /\b(uptown|downtown|northbound|southbound)\b/i.exec(text)?.[1];
  const track = /\bexpress track\b/i.test(text) ? "express" : /\blocal track\b/i.test(text) ? "local" : undefined;
  const label = bound ?? (ud ? ud[0].toUpperCase() + ud.slice(1).toLowerCase() : "");
  return label || track ? { label, ...(track ? { track } : {}) } : null;
}

/** "between <A> and <B>" in the header/description, both resolved to our stations, or null. */
export function parseBetween(sys: StaticSystem, text: string, routes: string[]): [Station, Station] | null {
  const re = /between\s+(.+?)\s+and\s+(.+?)(?=[.,;:\n]|\s+(?:in|on|from|due|while|because|after|stations?)\b|$)/gi;
  for (const m of text.matchAll(re)) {
    const a = resolveStation(sys, m[1], routes), b = resolveStation(sys, m[2], routes);
    if (a && b && a.id !== b.id) return [a, b];
  }
  return null;
}

export type AlertSegment = { route: string; coords: Array<[number, number]>; label: string; from: string; to: string; source: "stops" | "text" };
/**
 * Where an alert sits on a line. Stop-level entities (2+ on one route) give the
 * segment between the first and last affected stops. Route-only alerts use a
 * "between A and B" phrase when both stations resolve. Otherwise nothing.
 */
export function alertSegments(sys: StaticSystem, a: DisruptionAlert): AlertSegment[] {
  const out: AlertSegment[] = [];
  const byRoute = new Map<string, Set<string>>();
  for (const e of a.ents ?? []) {
    const set = byRoute.get(e.route) ?? byRoute.set(e.route, new Set()).get(e.route)!;
    set.add(stationOf(sys.system, e.stop));
  }
  for (const [route, stops] of byRoute) {
    const sm = sys.stopM[route];
    if (!sm) continue;
    const on = [...stops].filter((s) => sm[s] !== undefined).sort((x, y) => sm[x] - sm[y]);
    if (on.length < 2) continue;
    const coords = sliceBetween(sys, route, on[0], on[on.length - 1]);
    if (coords) out.push({ route, coords, label: a.text, from: on[0], to: on[on.length - 1], source: "stops" });
  }
  if (out.length || (a.ents ?? []).length) return out;
  const pair = parseBetween(sys, `${a.text}\n${a.description ?? ""}`, a.routes);
  if (!pair) return out;
  for (const route of a.routes) {
    const r = trackFor(sys, route, pair[0].id, pair[1].id);
    const coords = r ? sliceBetween(sys, r, pair[0].id, pair[1].id) : null;
    if (coords) out.push({ route, coords, label: a.text, from: pair[0].id, to: pair[1].id, source: "text" });
  }
  return out;
}

/** Stations an alert touches: stop entities, plus both ends of a parsed segment. */
export function alertStations(sys: StaticSystem, a: DisruptionAlert): string[] {
  const ids = new Set(a.stops.map((s) => stationOf(sys.system, s)));
  if (!ids.size) for (const s of alertSegments(sys, a)) { ids.add(s.from); ids.add(s.to); }
  return [...ids];
}

// ---------------------------------------------------------------- plain-English summary

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const orList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
const routeList = (rs: string[]) => rs.join("/");

/** Nearest stations on the route either side of the affected run that are not themselves affected. */
function neighbours(sys: StaticSystem, route: string, affected: Set<string>, header: string): string[] {
  const sm = sys.stopM[route];
  if (!sm) return [];
  const order = Object.keys(sm).sort((x, y) => sm[x] - sm[y]);
  const idx = order.map((s, i) => (affected.has(s) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return [];
  // A station the header names is part of the problem, never the alternative.
  const ok = (s: string) => !affected.has(s) && !header.includes(` ${norm(stationsOf(sys).byId.get(s)?.name ?? "")} `);
  const before = order.slice(0, idx[0]).reverse().find(ok);
  const after = order.slice(idx[idx.length - 1] + 1).find(ok);
  return [before, after].filter((s): s is string => Boolean(s)).map((s) => stationsOf(sys).byId.get(s)?.name ?? "").filter(Boolean);
}

/** Routes at a station's complex: GTFS splits complexes per line, so join same-named stations within 300 m. */
function complexRoutes(sys: StaticSystem, st: Station): Set<string> {
  const k = 111_320 * Math.cos((st.c[1] * Math.PI) / 180), n = norm(st.name);
  const out = new Set<string>();
  for (const s of stationsOf(sys).list) {
    if (norm(s.name) === n && Math.hypot((s.c[0] - st.c[0]) * k, (s.c[1] - st.c[1]) * 111_320) < 300) s.routes.forEach((r) => out.add(r));
  }
  return out;
}
/** Other lines that serve both stations (GTFS station routes), as a "take the …" alternative. */
function parallel(sys: StaticSystem, a: Station, b: Station, exclude: string[]): string[] {
  const rb = complexRoutes(sys, b);
  return [...complexRoutes(sys, a)].filter((r) => rb.has(r) && !exclude.includes(r) && !/X$/.test(r) && !exclude.some((x) => `${x}X` === r)).sort();
}

/**
 * One plain sentence or two, from the alert's structured fields and the
 * stations we can resolve. Null when the rules are not confident; show the
 * MTA header instead.
 */
export function summarizeAlert(sys: StaticSystem, a: DisruptionAlert): string | null {
  const routes = a.routes.filter((r) => sys.routes[r] || sys.stopM[r]);
  if (!routes.length) return null;
  const text = `${a.text}\n${a.description ?? ""}`;
  const dir = parseDirection(a.text);
  const who = `${dir?.label ? `${dir.label} ` : ""}${routeList(routes)}`;
  const type = a.type.toLowerCase();
  const byId = stationsOf(sys).byId;
  const stopIds = [...new Set(a.stops.map((s) => stationOf(sys.system, s)))];
  const names = stopIds.map((s) => byId.get(s)?.name);
  const allNamed = names.length > 0 && names.every(Boolean);

  if (/stops skipped|skip/.test(type) || (/\bskips?\b/i.test(a.text) && stopIds.length)) {
    if (!allNamed) return null;
    // Entities can include a station the header only mentions for another reason; prefer the ones the header names.
    const h = ` ${norm(a.text)} `;
    const named = (names as string[]).filter((n) => h.includes(` ${norm(n)} `));
    const alt = neighbours(sys, routes[0], new Set(stopIds), h);
    return `${who} skips ${list(named.length ? named : (names as string[]))}.${alt.length ? ` Use ${orList(alt)}.` : ""}`;
  }
  const via = /(?:runs?|running|rerouted)\s+(?:via|on)\s+the\s+\[?([A-Z0-9]{1,2})\]?(?:\s+line)?/i.exec(text)?.[1];
  const pair = parseBetween(sys, text, routes);
  if ((/reroute|detour/.test(type) || via) && via && pair && sys.stopM[via]) {
    return `${who} runs on the ${via} line between ${pair[0].name} and ${pair[1].name}.`;
  }
  if (/no (scheduled )?service|suspend/.test(type) || /\bno \[?[A-Z0-9]{1,2}\]? (?:trains|service)\b/i.test(a.text)) {
    if (!pair) return null;
    const alt = parallel(sys, pair[0], pair[1], routes);
    return `No ${who} between ${pair[0].name} and ${pair[1].name}.${alt.length ? ` Take the ${routeList(alt)}.` : ""}`;
  }
  if (/express to local/.test(type) && allNamed) return `${who} also stops at ${list(names as string[])}.`;
  if (/local to express/.test(type) && allNamed) return `${who} runs express and skips ${list(names as string[])}.`;
  if (/delay/.test(type) || a.kind === "delay") {
    const near = /\b(?:at|near)\s+([A-Z0-9][^.,;\n]*?)(?=[.,;\n]|$)/.exec(a.text)?.[1];
    const st = near ? resolveStation(sys, near, routes) : undefined;
    return `${who} ${routes.length > 1 ? "are" : "is"} delayed${st ? ` near ${st.name}` : ""}.`;
  }
  return null;
}

// ---------------------------------------------------------------- shared hold memory

const holdMemory = new Map<string, HoldState>();
/** Hold verdict for one trip, remembered across feed refreshes for the page's lifetime. */
export function holdOf(key: string, trip: LiveTrip, feedAt: number): Hold {
  const h = updateHold(holdMemory.get(key), trip, feedAt);
  holdMemory.set(key, h.state);
  if (holdMemory.size > 5000) for (const [k, v] of holdMemory) if (feedAt - v.feedAt > 1800) holdMemory.delete(k);
  return h;
}
