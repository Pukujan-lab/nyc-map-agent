/**
 * When to ask "Are you in the station?". GPS cannot tell street from
 * platform, so asking is the primary signal; these rules only decide when a
 * question is worth one tap. Pure, for tests.
 *
 * Ask when either:
 *  - the last good fix was within ~60 m of a station entrance AND then the
 *    network went offline or GPS accuracy suddenly got much worse, or
 *  - the active trip says the person is boarding a subway at a station.
 * At most once per station visit; never again for a station after a No.
 */
import { metres, type Pt, type Station, type SubwayStatic } from "./exits";

export const ENTRANCE_M = 60;
/** Further than this from the station and the visit is over: it may be asked again next time. */
export const VISIT_END_M = 250;

/** Accuracy that "suddenly got much worse": at least 50 m, and 3× (or +60 m over) the recent best. */
export function accuracyWorsened(baseline: number | null, now: number | null): boolean {
  if (baseline === null || now === null) return false;
  return now >= 50 && (now >= baseline * 3 || now >= baseline + 60);
}

/** The station whose street entrance is within `maxM` of the point, nearest first. */
export function stationAtEntrance(sys: SubwayStatic, at: Pt, maxM = ENTRANCE_M): Station | null {
  let best: { id: string; name: string; d: number } | null = null;
  for (const f of sys.entrances?.features ?? []) {
    if (/passage|easement/i.test(f.properties.kind)) continue;
    const d = metres(at, f.geometry.coordinates as Pt);
    if (d <= maxM && (!best || d < best.d)) best = { id: String(f.properties.id), name: f.properties.name, d };
  }
  if (!best) return null;
  const st = sys.stations.features.find((f) => String(f.properties.id) === best.id);
  const p = (st?.geometry.coordinates ?? [at[0], at[1]]) as Pt;
  return { id: best.id, name: st?.properties.name ?? best.name, at: [p[0], p[1]] };
}

export interface PromptSignals {
  /** Station whose entrance the last good fix was next to (null when not near one or not sharing location). */
  nearStation: Station | null;
  online: boolean;
  /** Best recent GPS accuracy (m) and the latest one. */
  baselineAccuracy: number | null;
  accuracy: number | null;
  /** The shared position, if the person shares it (used only to tell whether a trip is under way). */
  here: Pt | null;
  /** Station the active trip boards a subway at, if any. */
  boarding: Station | null;
  /** Stations already asked about this visit, and stations the person said No for. */
  asked: ReadonlySet<string>;
  declined: ReadonlySet<string>;
}

/** The station to ask about, or null. Trip boarding wins over the entrance signals. */
export function stationToAsk(s: PromptSignals): Station | null {
  const ok = (st: Station | null) => !!st && !s.asked.has(st.id) && !s.declined.has(st.id);
  // A shared position far from the boarding station means the trip is not under way yet.
  const atBoarding = !!s.boarding && (!s.here || metres(s.here, s.boarding.at) <= VISIT_END_M);
  if (atBoarding && ok(s.boarding)) return s.boarding;
  if (ok(s.nearStation) && (!s.online || accuracyWorsened(s.baselineAccuracy, s.accuracy))) return s.nearStation;
  return null;
}

/** Visits that ended because the person is now far from that station; those may be asked again. */
export function endedVisits(asked: ReadonlyMap<string, Pt>, here: Pt | null): string[] {
  if (!here) return [];
  return [...asked].filter(([, at]) => metres(here, at) > VISIT_END_M).map(([id]) => id);
}

/** The station a trip boards the subway at: the first enter leg followed by a subway ride. */
export function boardingStation(trip: { legs: Array<{ kind: string; mode?: string; station?: { id: string; name: string; lon: number; lat: number } }> } | null): Station | null {
  if (!trip) return null;
  const i = trip.legs.findIndex((l) => l.kind === "enter");
  const leg = i >= 0 ? trip.legs[i] : null;
  const rides = trip.legs.slice(i + 1).some((l) => l.kind === "ride" && (l.mode ?? "subway") === "subway");
  if (!leg?.station || !rides) return null;
  return { id: leg.station.id, name: leg.station.name, at: [leg.station.lon, leg.station.lat] };
}

const DECLINED_KEY = "nyc-map:underground:declined";

export function loadDeclined(): Set<string> {
  try {
    const raw = localStorage.getItem(DECLINED_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveDeclined(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(DECLINED_KEY, JSON.stringify([...ids]));
  } catch {
    /* storage blocked: the No still holds for this session */
  }
}
