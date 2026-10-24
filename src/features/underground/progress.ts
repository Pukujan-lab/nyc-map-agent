/**
 * Trip progress underground: the last confirmed station plus an honest
 * estimate of the segment, never a precise dot and never GPS. Sources, most
 * trusted first: the person's tap ("I'm at…"), the live feed (newer than the
 * tap), motion-detected stops, then the timetable, which widens the longer
 * there is no data. Pure, for tests.
 *
 * Not built: step counting (dead reckoning) inside the station. Compass drift
 * underground makes a moving dot unreliable. A possible later experiment,
 * behind its own flag, re-anchored by taps such as "I'm at the turnstiles".
 */
import { metres, type Pt } from "./exits";
import type { StopEvent } from "./motion";

export interface Stop {
  id: string;
  name: string;
  at: Pt;
}

export type Source = "start" | "user" | "live" | "motion";

export interface Progress {
  stops: Stop[];
  /** Index of the last confirmed station. */
  idx: number;
  /** When it was confirmed (ms) and by whom. */
  at: number;
  source: Source;
  /** The train has left stops[idx] (live feed or motion said so). */
  departed: boolean;
  /** The live feed shows the train held at stops[idx]. */
  held: boolean;
  /** Time of the last live data (ms). */
  liveAt: number | null;
}

/** Rough run time between two stations: ~30 km/h average plus a dwell. */
export function runTimeS(a: Stop, b: Stop): number {
  return metres(a.at, b.at) / 8.5 + 25;
}

export function startProgress(stops: Stop[], now: number, idx = 0): Progress {
  return { stops, idx: Math.max(0, Math.min(idx, stops.length - 1)), at: now, source: "start", departed: false, held: false, liveAt: null };
}

/** "I'm at…": the tap wins until newer live data says otherwise. */
export function userAt(p: Progress, idx: number, now: number): Progress {
  if (idx < 0 || idx >= p.stops.length) return p;
  return { ...p, idx, at: now, source: "user", departed: false, held: false };
}

/** One live trip from /api/transit/subway: [stop id, arrival s, departure s?] and the stop the vehicle reports. */
export interface LiveTrip {
  stops: Array<[string, number] | [string, number, number]>;
  atStop?: string;
}

/** Live feed data, unless the person tapped more recently than the feed was made. */
export function fromLive(p: Progress, live: LiveTrip, feedAtMs: number, now: number): Progress {
  if (p.source === "user" && p.at > feedAtMs) return p;
  const nowS = now / 1000;
  const find = (id: string) => p.stops.findIndex((s) => s.id === id);
  // The vehicle says it is at a stop we know: there, and held if its departure time passed a minute ago.
  if (live.atStop) {
    const k = find(live.atStop);
    const row = live.stops.find((s) => s[0] === live.atStop);
    const dep = row ? (row[2] ?? row[1]) : null;
    if (k >= 0 && (!row || row[1] <= nowS + 30)) return { ...p, idx: k, at: feedAtMs, source: "live", departed: false, held: dep !== null && dep < nowS - 60, liveAt: feedAtMs };
  }
  const next = live.stops.find((s) => (s[2] ?? s[1]) >= nowS && find(s[0]) >= 0);
  if (!next) return { ...p, liveAt: feedAtMs };
  const k = find(next[0]);
  if (next[1] <= nowS) return { ...p, idx: k, at: feedAtMs, source: "live", departed: false, held: false, liveAt: feedAtMs };
  return { ...p, idx: Math.max(0, k - 1), at: feedAtMs, source: "live", departed: k > 0, held: false, liveAt: feedAtMs };
}

export type Ask = { kind: "confirm"; stop: number } | { kind: "between"; from: number; to: number } | null;

/**
 * A motion-detected stop: advance one station and ask to confirm, unless the
 * stop was long (held?) or the run before it does not fit the timetable; then
 * do not advance, ask "between A and B". Live data and newer taps still win.
 */
export function onMotionStop(p: Progress, ev: StopEvent, now: number): { progress: Progress; ask: Ask } {
  const next = p.idx + 1;
  if (next >= p.stops.length) return { progress: p, ask: null };
  const expected = runTimeS(p.stops[p.idx], p.stops[next]);
  const fits = ev.runS === null || (ev.runS >= expected * 0.5 && ev.runS <= expected * 2 + 60);
  if (ev.kind === "long" || !fits) return { progress: { ...p, departed: true }, ask: { kind: "between", from: p.idx, to: next } };
  return { progress: { ...p, idx: next, at: now, source: "motion", departed: false, held: false }, ask: { kind: "confirm", stop: next } };
}

export interface Estimate {
  kind: "at" | "between" | "probably-between";
  from: Stop;
  to: Stop | null;
  label: string;
  /** Minutes since the last data (tap, feed or detected stop). */
  sinceMin: number;
  /** True when the exit flow should ask "Which station are you at?". */
  uncertain: boolean;
}

/** After this long without data, only a wide range is honest. */
export const WIDE_AFTER_MS = 5 * 60_000;

/** Timetable position (fractional stop index) `s` seconds after the confirmation. */
function positionAfter(p: Progress, s: number): number {
  let t = p.departed ? 0 : 25; // dwell left at a confirmed stop
  let i = p.idx;
  if (s <= t) return i;
  while (i + 1 < p.stops.length) {
    const run = runTimeS(p.stops[i], p.stops[i + 1]);
    if (s <= t + run) return i + (s - t) / run;
    t += run;
    i++;
  }
  return p.stops.length - 1;
}

/**
 * Where the train probably is now. Widening rule: the timetable window is
 * ±(30 s + 25% of the time since the last data); past 5 minutes only
 * "probably between A and C" (at least two stops wide).
 */
export function estimate(p: Progress, now: number, online: boolean): Estimate {
  const s = Math.max(0, (now - p.at) / 1000);
  const sinceMin = Math.round(s / 60);
  const name = (i: number) => p.stops[i].name;
  const last = p.stops.length - 1;
  const tag = online && p.source === "live" ? `live, ${sinceMin < 1 ? "just now" : `${sinceMin} min ago`}` : `estimated, no signal · ${sinceMin < 1 ? "under a minute" : `${sinceMin} min`} since last update`;
  if (p.held) return { kind: "at", from: p.stops[p.idx], to: null, label: `Held at ${name(p.idx)} (${tag})`, sinceMin, uncertain: false };
  const sure = p.source === "user" || p.source === "live";
  // Just confirmed and not yet left: say where, before the timetable takes over.
  if (!p.departed && s <= 60 && p.source !== "start") {
    return { kind: "at", from: p.stops[p.idx], to: null, label: `${sure ? "At" : "Probably at"} ${name(p.idx)} (${p.source === "user" ? "you said" : tag})`, sinceMin, uncertain: !sure };
  }
  const u = 30 + 0.25 * s;
  let lo = Math.floor(positionAfter(p, Math.max(0, s - u)));
  let hi = Math.ceil(positionAfter(p, s + u));
  if (now - p.at > WIDE_AFTER_MS) {
    if (hi - lo < 2) hi = Math.min(last, lo + 2);
    if (hi - lo < 2) lo = Math.max(0, hi - 2);
    return { kind: "probably-between", from: p.stops[lo], to: p.stops[hi], label: `Probably between ${name(lo)} and ${name(hi)} (${tag})`, sinceMin, uncertain: true };
  }
  if (lo === hi) {
    return { kind: "at", from: p.stops[lo], to: null, label: `${sure ? "At" : "Probably at"} ${name(lo)} (${p.source === "user" ? "you said" : tag})`, sinceMin, uncertain: !sure };
  }
  hi = Math.min(hi, lo + 3);
  return { kind: "between", from: p.stops[lo], to: p.stops[hi], label: `Probably between ${name(lo)} and ${name(hi)} (${tag})`, sinceMin, uncertain: true };
}

/** The "I'm at…" choices: the previous stop, the confirmed one and the next 3. */
export function atChoices(p: Progress): number[] {
  const out: number[] = [];
  for (let i = p.idx - 1; i <= p.idx + 3; i++) if (i >= 0 && i < p.stops.length) out.push(i);
  return out;
}
