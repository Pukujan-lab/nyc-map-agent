import { useEffect, useState } from "react";
import { z } from "zod";
import type { Trip, TripCore } from "./schema";

/**
 * The daily explorer's commute (#370): saved Home and Work, the usual trip
 * between them, and whether its line has a delay alert. Everything here is
 * read from and written to this device only.
 */

/** Same storage key and shape as the Home and Work pills from #327, so a spot saved there shows here. */
export const SAVED_PLACES_KEY = "nma.homeWork";
/** The last trip planned between Home and Work, one per direction. */
export const USUAL_KEY = "nma.commute";
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
    return () => {
      window.removeEventListener("storage", reread);
      window.removeEventListener(CHANGED, reread);
    };
  }, []);
  return places;
}

/** Morning goes to Work, from noon on the usual trip is Home. */
export function commuteFor(hour: number): CommuteTo {
  return hour < 12 ? "work" : "home";
}

const usualRide = z.object({ route: z.string().max(10), color: z.string().max(9).optional(), minutes: z.number().int().positive() });
const usual = usualRide.extend({ alternatives: z.array(usualRide).max(4).default([]) });
export type UsualRide = z.infer<typeof usualRide>;
export type UsualTrip = z.infer<typeof usual>;

const metres = (a: readonly [number, number], b: SavedSpot) => {
  const k = 111_320;
  return Math.hypot((a[0] - b.lon) * k * Math.cos((b.lat * Math.PI) / 180), (a[1] - b.lat) * k);
};
/** A trip end this close to a saved spot counts as that spot. */
const NEAR_M = 900;

function rideOf(t: TripCore): UsualRide | null {
  const ride = t.legs.find((l) => l.kind === "ride");
  if (!ride || ride.kind !== "ride") return null;
  const minutes = Math.max(1, Math.round((Date.parse(t.arriveIso) - Date.parse(t.departIso)) / 60_000));
  if (!Number.isFinite(minutes)) return null;
  return { route: ride.route, ...(ride.color ? { color: ride.color } : {}), minutes };
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

/** The usual line and its alternatives from a planned commute. */
export function usualFromTrip(trip: Trip): UsualTrip | null {
  const main = rideOf(trip);
  if (!main) return null;
  const alternatives = trip.alternatives.map(rideOf).filter((r): r is UsualRide => !!r && r.route !== main.route);
  return { ...main, alternatives };
}

export function readUsual(to: CommuteTo, storage: Store | undefined = local()): UsualTrip | null {
  const parsed = usual.safeParse(readJson(USUAL_KEY, storage)[to]);
  return parsed.success ? parsed.data : null;
}

/** Remember a planned trip as the usual commute when it runs between Home and Work. */
export function rememberCommute(trip: Trip, storage: Pick<Storage, "getItem" | "setItem"> | undefined = local()): CommuteTo | null {
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
export const lineAlert = z.object({ id: z.string(), kind: z.string(), text: z.string(), routes: z.array(z.string()) });
export type LineAlert = z.infer<typeof lineAlert>;
export const alertsBody = z.object({ alerts: z.array(lineAlert.passthrough()).default([]) }).passthrough();

export interface LineDelay {
  route: string;
  /** Minutes the alert names, when it names any. */
  minutes: number | null;
  cause: string;
}

const CAUSE = /\b(?:because of|due to|while (?:we|crews) (?:address|investigate|respond to|work on|repair)|after|while)\s+(?:an?\s+|the\s+)?([^.\n]+)/i;

/** The first active delay alert on a line, with its minutes and cause in plain words. */
export function delayOn(alerts: LineAlert[], route: string): LineDelay | null {
  const a = alerts.find((x) => x.kind === "delay" && x.routes.includes(route));
  if (!a) return null;
  const head = a.text.split("\n")[0].replace(/\]\s*\[/g, "/").replace(/\[([A-Z0-9/]+)\]/g, "$1").trim();
  const mins = /(\d{1,2})\s*(?:-|to)?\s*(?:\d{1,2}\s*)?min/i.exec(a.text);
  const cause = (CAUSE.exec(head)?.[1] ?? head).trim().replace(/[.!]+$/, "");
  const text = cause.length > 80 ? `${cause.slice(0, 79)}…` : cause;
  return { route, minutes: mins ? Number(mins[1]) : null, cause: text.charAt(0).toUpperCase() + text.slice(1) };
}

const where = (name: string, s: SavedSpot) => `${name}${s.label !== name ? ` (${s.label})` : ""} at ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`;

/** The question the Go button and the two commute-alert choices ask the trip planner. */
export function commutePrompt(to: CommuteTo, places: HomeWork, opts: { via?: string; leaveAt?: Date } = {}): string | null {
  const from = to === "work" ? places.home : places.work;
  const dest = to === "work" ? places.work : places.home;
  if (!from || !dest) return null;
  const when = opts.leaveAt
    ? `leaving at ${opts.leaveAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}`
    : "leaving now";
  const via = opts.via ? `, taking the ${opts.via} train` : "";
  return `Plan my trip from ${where(to === "work" ? "Home" : "Work", from)} to ${where(to === "work" ? "Work" : "Home", dest)}, ${when}${via}.`;
}
