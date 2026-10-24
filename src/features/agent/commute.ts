import { useEffect, useState } from "react";
import { z } from "zod";
import { COMMUTE_KEY, HOME_WORK_KEY, MEMORY_CHANGED, remembers } from "@/lib/memory/memory";
import { sameStation } from "@/lib/transit/serviceChanges";
import type { MapPoint, Trip, TripCore } from "./schema";

/**
 * The daily explorer's commute (#370): saved Home and Work, the usual trip
 * between them, and whether its line has a delay alert. Everything here is
 * read from and written to this device only.
 */

/** Same storage key and shape as the Home and Work pills from #327, so a spot saved there shows here. */
export const SAVED_PLACES_KEY = HOME_WORK_KEY;
/** The last trip planned between Home and Work, one per direction. */
export const USUAL_KEY = COMMUTE_KEY;
const CHANGED = "nma:homeWork";

const spot = z.object({
  label: z.string().trim().min(1).max(80),
  lon: z.number().min(-74.4).max(-73.5),
  lat: z.number().min(40.4).max(41.05),
});
export type SavedSpot = z.infer<typeof spot>;
export interface HomeWork {
  home: SavedSpot | null;
  work: SavedSpot | null;
}
export type CommuteTo = "home" | "work";

type Store = Pick<Storage, "getItem">;
const local = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

function readJson(key: string, storage: Store | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(storage?.getItem(key) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function readHomeWork(storage: Store | undefined = local()): HomeWork {
  // Home & Work paused in What we remember: nothing is read (and it was cleared).
  if (!remembers("homeWork")) return { home: null, work: null };
  const raw = readJson(SAVED_PLACES_KEY, storage);
  const home = spot.safeParse(raw.home);
  const work = spot.safeParse(raw.work);
  return { home: home.success ? home.data : null, work: work.success ? work.data : null };
}

/** Saved Home and Work, re-read when another tab or the #327 pills change them. */
export function useHomeWork(): HomeWork {
  const [places, setPlaces] = useState(() => readHomeWork());
  useEffect(() => {
    const reread = () => setPlaces(readHomeWork());
    window.addEventListener("storage", reread);
    window.addEventListener(CHANGED, reread);
    window.addEventListener(MEMORY_CHANGED, reread);
    return () => {
      window.removeEventListener("storage", reread);
      window.removeEventListener(CHANGED, reread);
      window.removeEventListener(MEMORY_CHANGED, reread);
    };
  }, []);
  return places;
}

/** Morning goes to Work, from noon on the usual trip is Home. */
export function commuteFor(hour: number): CommuteTo {
  return hour < 12 ? "work" : "home";
}

const usualRide = z.object({
  route: z.string().max(10),
  color: z.string().max(9).optional(),
  minutes: z.number().int().positive(),
  /** Where the first train is boarded, as the planner named it. */
  board: z.string().max(80).optional(),
  /** Where the last train is left. A name only, never a coordinate. */
  alight: z.string().max(80).optional(),
  /** Departure clock in New York, so a summary can say "around 8:40" without storing a place. */
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  /** Each change of train: "Change at Times Sq-42 St to the 7". Empty when there is none. */
  transfers: z.array(z.string().max(120)).max(4).default([]),
});
const usual = usualRide.extend({ alternatives: z.array(usualRide).max(4).default([]) });
export type UsualRide = z.infer<typeof usualRide>;
export type UsualTrip = z.infer<typeof usual>;

const metres = (a: readonly [number, number], b: SavedSpot) => {
  const k = 111_320;
  return Math.hypot((a[0] - b.lon) * k * Math.cos((b.lat * Math.PI) / 180), (a[1] - b.lat) * k);
};
/** A trip end this close to a saved spot counts as that spot. */
const NEAR_M = 900;

/** Hour and minute in New York. Null when the timestamp is missing or broken. */
export function nyClock(iso: string | undefined): { hour: number; minute: number } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  let hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  if (hour === 24) hour = 0;
  if (!Number.isInteger(hour) || hour > 23 || !Number.isInteger(minute) || minute > 59) return null;
  return { hour, minute };
}

function rideOf(t: TripCore): UsualRide | null {
  const rides = t.legs.flatMap((l) => (l.kind === "ride" ? [l] : []));
  const ride = rides[0];
  if (!ride) return null;
  const minutes = Math.max(1, Math.round((Date.parse(t.arriveIso) - Date.parse(t.departIso)) / 60_000));
  if (!Number.isFinite(minutes)) return null;
  const transfers = rides.slice(1).map((next, i) => {
    const at = rides[i].toStop ?? next.fromStop;
    return `Change${at ? ` at ${at}` : ""} to the ${next.route}`;
  });
  const alight = rides.at(-1)?.toStop;
  const clock = nyClock(t.departIso);
  return {
    route: ride.route,
    ...(ride.color ? { color: ride.color } : {}),
    minutes,
    ...(ride.fromStop ? { board: ride.fromStop } : {}),
    ...(alight ? { alight } : {}),
    ...(clock ?? {}),
    transfers,
  };
}

/** Which way a planned trip goes between Home and Work, or null when it is not a commute. */
export function commuteOf(trip: TripCore, places: HomeWork): CommuteTo | null {
  const { home, work } = places;
  if (!home || !work) return null;
  const from = trip.origin.at;
  const to = trip.destination.at;
  if (metres(from, home) <= NEAR_M && metres(to, work) <= NEAR_M) return "work";
  if (metres(from, work) <= NEAR_M && metres(to, home) <= NEAR_M) return "home";
  return null;
}

/** The usual line and its alternatives from a planned commute. The clock and the last stop stay on the ride the person takes, not on each alternative. */
export function usualFromTrip(trip: Trip): UsualTrip | null {
  const main = rideOf(trip);
  if (!main) return null;
  const alternatives = trip.alternatives.map(rideOf).flatMap((r) => {
    if (!r || r.route === main.route) return [];
    return [{ route: r.route, ...(r.color ? { color: r.color } : {}), minutes: r.minutes, ...(r.board ? { board: r.board } : {}), transfers: r.transfers }];
  });
  return { ...main, alternatives };
}

export function readUsual(to: CommuteTo, storage: Store | undefined = local()): UsualTrip | null {
  if (!remembers("rides")) return null;
  const parsed = usual.safeParse(readJson(USUAL_KEY, storage)[to]);
  return parsed.success ? parsed.data : null;
}

/** Remember a planned trip as the usual commute when it runs between Home and Work. */
export function rememberCommute(trip: Trip, storage: Pick<Storage, "getItem" | "setItem"> | undefined = local()): CommuteTo | null {
  if (!remembers("rides")) return null;
  const to = commuteOf(trip, readHomeWork(storage));
  const u = to ? usualFromTrip(trip) : null;
  if (!to || !u || !storage) return null;
  try {
    storage.setItem(USUAL_KEY, JSON.stringify({ ...readJson(USUAL_KEY, storage), [to]: u }));
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    /* private mode */
  }
  return to;
}

/** The slice of an MTA alert the commute card reads (GET /api/transit/alerts). */
export const lineAlert = z.object({
  id: z.string(),
  kind: z.string(),
  text: z.string(),
  routes: z.array(z.string()),
  /** Active window, unix seconds; end 0 = open-ended. */
  start: z.number().default(0),
  end: z.number().default(0),
  /** The MTA's own wording of the window, when it gives one. */
  period: z.string().default(""),
  direction: z.string().default(""),
  stops: z.array(z.string()).default([]),
  skipNames: z.array(z.string()).default([]),
  via: z.array(z.string()).default([]),
  replacement: z.array(z.string()).default([]),
  changes: z.array(z.object({ route: z.string(), kind: z.string(), names: z.array(z.string()).default([]), notice: z.string().default("") })).default([]),
});
export type LineAlert = z.infer<typeof lineAlert>;
export const alertsBody = z.object({ alerts: z.array(lineAlert.passthrough()).default([]) }).passthrough();

export interface LineDelay {
  route: string;
  /** Minutes the alert names, when it names any. */
  minutes: number | null;
  cause: string;
}

/** "[A][H] trains" -> "A/H trains". */
const clean = (s: string) => s.replace(/\]\s*\[/g, "/").replace(/\[([A-Z0-9/]+)\]/g, "$1").trim();
const CAUSE = /\b(?:because of|due to|while (?:we|crews) (?:address|investigate|respond to|work on|repair)|after|while)\s+(?:an?\s+|the\s+)?([^.\n]+)/i;

/** The first active delay alert on a line, with its minutes and cause in plain words. */
export function delayOn(alerts: LineAlert[], route: string): LineDelay | null {
  const a = alerts.find((x) => x.kind === "delay" && x.routes.includes(route));
  if (!a) return null;
  const head = clean(a.text.split("\n")[0]);
  const mins = /(\d{1,2})\s*(?:-|to)?\s*(?:\d{1,2}\s*)?min/i.exec(a.text);
  const cause = (CAUSE.exec(head)?.[1] ?? head).trim().replace(/[.!]+$/, "");
  const text = cause.length > 80 ? `${cause.slice(0, 79)}…` : cause;
  return { route, minutes: mins ? Number(mins[1]) : null, cause: text.charAt(0).toUpperCase() + text.slice(1) };
}

const where = (name: string, s: SavedSpot) => `${name}${s.label !== name ? ` (${s.label})` : ""} at ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`;

/** The question the Go button and the other-line choice ask the trip planner. */
export function commutePrompt(to: CommuteTo, places: HomeWork, opts: { via?: string; showTransfer?: boolean } = {}): string | null {
  const from = to === "work" ? places.home : places.work;
  const dest = to === "work" ? places.work : places.home;
  if (!from || !dest) return null;
  const via = opts.via ? `, taking the ${opts.via} train` : "";
  const show = opts.showTransfer ? " Show me where to board and the transfer on the map." : "";
  return `Plan my trip from ${where(to === "work" ? "Home" : "Work", from)} to ${where(to === "work" ? "Work" : "Home", dest)}, leaving now${via}.${show}`;
}

/** What a tapped delay notice expands to (#370). Built only from the alerts feed. */
export interface DelayDetails {
  /** The MTA's window wording, else the start time. */
  since: string | null;
  /** The end time; null when the feed gives none. */
  until: string | null;
  /** Each affected line and how: "slower", "skips 50 St", "rerouted via the F". Lines the feed does not name are left out. */
  effects: Array<{ route: string; how: string }>;
  /** Stations the alerts name: the problem spot first, then skipped stations. */
  stations: string[];
  /** GTFS stop ids the alerts name. */
  stopIds: string[];
}

const when = (t: number) => new Date(t * 1000).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const PROBLEM_AT = /\b(?:at|near)\s+([A-Z0-9][\w .'/&–-]*?)(?=[.,;\n]|\s+(?:and|while|because|due)\b|$)/;

export function delayDetails(alerts: LineAlert[], route: string, now = Date.now()): DelayDetails | null {
  const delay = alerts.find((x) => x.kind === "delay" && x.routes.includes(route));
  if (!delay) return null;
  const t = now / 1000;
  const active = (a: LineAlert) => (!a.start || a.start <= t) && (!a.end || a.end > t);
  const related = [
    delay,
    ...alerts.filter((a) => a !== delay && a.routes.includes(route) && active(a) && (a.changes.length > 0 || a.via.length > 0 || a.replacement.length > 0 || a.skipNames.length > 0)),
  ];
  const effects: Array<{ route: string; how: string }> = [];
  const add = (r: string, how: string) => {
    if (how && !effects.some((e) => e.route === r && e.how === how)) effects.push({ route: r, how });
  };
  for (const a of related) {
    if (a.kind === "delay") for (const r of a.routes) add(r, `slower${a.direction ? `, ${a.direction}` : ""}`);
    for (const c of a.changes) add(c.route, c.kind === "skip" ? `skips ${c.names.join(", ")}` : c.notice);
    if (!a.changes.some((c) => c.kind === "skip") && a.skipNames.length) for (const r of a.routes) add(r, `no service at ${a.skipNames.join(", ")}`);
    if (a.via.length) for (const r of a.routes) add(r, `rerouted via the ${a.via.join(", ")}`);
    if (a.replacement.length) for (const r of a.routes) add(r, `shuttle buses ${a.replacement.join(", ")}`);
  }
  const problem = PROBLEM_AT.exec(clean(delay.text.split("\n")[0]))?.[1]?.trim();
  return {
    since: delay.period || (delay.start ? when(delay.start) : null),
    until: !delay.period && delay.end ? when(delay.end) : null,
    effects,
    stations: [...new Set([...(problem ? [problem] : []), ...related.flatMap((a) => [...a.skipNames, ...a.changes.flatMap((c) => c.names)])])],
    stopIds: [...new Set(related.flatMap((a) => a.stops))],
  };
}

/** The station list in /transit/subway.json (the same file the transit feature loads). */
export const subwayStations = z.object({
  stations: z.object({
    features: z.array(z.object({ geometry: z.object({ coordinates: z.array(z.number()).min(2) }), properties: z.object({ id: z.union([z.string(), z.number()]), name: z.string() }) })),
  }),
  /** Route colours, so an affected line's bullet is drawn in its own colour. */
  routes: z.record(z.string(), z.object({ color: z.string().optional(), text: z.string().optional() }).passthrough()).default({}),
});
export type SubwayStations = z.infer<typeof subwayStations>;

/** Where the named stations are: by name first, then by stop id ("127N" is station 127). */
export function stationPoints(sys: SubwayStations, d: Pick<DelayDetails, "stations" | "stopIds">): MapPoint[] {
  const feats = sys.stations.features;
  const out: MapPoint[] = [];
  const push = (f: (typeof feats)[number] | undefined) => {
    if (!f || out.some((p) => p.name === f.properties.name)) return;
    out.push({ at: [f.geometry.coordinates[0], f.geometry.coordinates[1]], name: f.properties.name });
  };
  for (const name of d.stations) push(feats.find((x) => sameStation(name, x.properties.name)));
  for (const id of d.stopIds) push(feats.find((x) => String(x.properties.id) === id.replace(/[NS]$/, "")));
  return out.slice(0, 20);
}
