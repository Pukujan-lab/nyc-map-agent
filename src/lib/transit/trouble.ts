/**
 * MTA trouble in plain terms (#361, goal 5): for one subway line, what is
 * wrong, which stations are skipped, where the shuttle buses run and where
 * to board them, where to get the train back, where the MTA says to switch
 * direction, and which trains look stuck. Pure: the inputs are the camsys
 * GTFS-realtime alerts JSON (with the Mercury extension), the station list
 * (data.ny.gov 39hk-dx4f) and live vehicle entries, so every derivation is
 * tested against recorded real alerts.
 *
 * What the data can and cannot say:
 *  - Skipped stations come from the alert headline ("uptown [C] skips 72 St,
 *    81 St…"), applied to every line the alert's entities name. The entity
 *    stop ids are not the skip list: they include the stations where the
 *    change starts and ends, and sometimes miss one the headline names.
 *  - For a suspension the entity stop ids are the stations without service.
 *  - Shuttle bus boarding spots come only from Mercury `station_alternative`
 *    notes ("Nostrand Av at Myrtle Av (to Bedford-Nostrand Avs)"). They are
 *    street corners in words, placed at their station: never geocoded or
 *    invented. Without notes, only the two ends ("between A and B") are shown.
 *  - Where to switch direction comes only from the MTA's own sentences
 *    ("take the [C] to 125 St and transfer to a downtown [C]"; "Transfer
 *    between uptown and downtown trains with fare-capped OMNY at 86 St").
 *    No open dataset says which stations have a free crossover or an island
 *    platform, so nothing is computed beyond what the alert says.
 *  - A stuck train is a live vehicle whose last position update is older than
 *    a threshold, mid-trip, on a line with an active (unplanned) delay alert.
 *    The feed has no coordinates: the train is placed at its current or next station.
 */
import { sameStation, serviceChanges } from "./serviceChanges";

type Pt = readonly [number, number];
type Translated = { translation?: Array<{ text: string; language?: string }> };

/** One entity of the camsys alerts JSON, as much of it as this reads. */
export interface FeedAlert {
  id: string;
  alert: {
    active_period?: Array<{ start?: number; end?: number }>;
    informed_entity?: Array<{ route_id?: string; stop_id?: string; direction_id?: number }>;
    header_text?: Translated;
    description_text?: Translated;
    "transit_realtime.mercury_alert"?: {
      alert_type?: string;
      station_alternative?: Array<{ affected_entity?: { stop_id?: string }; notes?: Translated }>;
    };
  };
}

/** A station from 39hk-dx4f: GTFS stop id, complex, daytime routes, direction labels. */
export interface TroubleStation {
  gtfsId: string;
  complexId: string;
  name: string;
  routes: string[];
  at: Pt;
  /** "Uptown", "Manhattan", "Last Stop"… */
  north?: string;
  south?: string;
}
export interface TroubleStop { id: string; name: string; at: [number, number] }

export type TroubleKind = "delay" | "suspended" | "skip" | "reroute" | "reduced" | "other";

/** A shuttle bus stop as the MTA words it, placed at its station. */
export interface ShuttleStop { station: TroubleStop; where: string; toward: string | null }

/** A station where the MTA says to change to the other direction. */
export interface DirectionSwitch {
  station: TroubleStop;
  /** What to board there, in the MTA's words without brackets: "a downtown C", "a Manhattan-bound train". */
  board: string;
  /** "to": to reach a skipped station; "from": to leave one; "crossover": a general tip. */
  why: "to" | "from" | "crossover";
  /** True when the MTA says you leave and re-enter (fare-capped OMNY, a GO ticket). */
  leaveStation: boolean;
}

export interface LineTrouble {
  alertId: string;
  route: string;
  kind: TroubleKind;
  /** The headline with icons removed and [X] written as X. */
  headline: string;
  /** "Coney Island-bound", "Downtown", or null for both directions / unknown. */
  direction: string | null;
  /** "some … trains will skip": only some trains do it. */
  partial: boolean;
  /** Where a live delay started, when the headline names a station ("track fire at Canal St"). */
  problemAt: TroubleStop[];
  skipped: TroubleStop[];
  shuttle: { buses: string[]; between: TroubleStop[]; stops: ShuttleStop[] } | null;
  /** Where the shuttle meets the train again ("Transfer between [G] and shuttle buses at Bedford-Nostrand Avs"). */
  rejoin: TroubleStop[];
  /** The line to board at the rejoin station ("A" for the Rockaway Park shuttle buses at Beach 67 St). */
  rejoinLine: string | null;
  switchDirection: DirectionSwitch[];
}

const en = (t?: Translated) => t?.translation?.find((x) => !x.language || x.language === "en")?.text ?? "";
/** "[shuttle bus icon] Free T403 [G]" → "Free T403 G". */
export const plainAlertText = (s: string) => s.replace(/\[[a-z][a-z ]* icon\]\s*/gi, "").replace(/\]\[/g, "]/[").replace(/\[([A-Z0-9]{1,3})\]/g, "$1").replace(/[ \t]+/g, " ").trim();
/** A station name lifted from prose: icons, route bullets and "| …" accessibility suffixes removed. */
const cleanName = (s: string) => s.replace(/\[[^\]]*\]/g, "").replace(/\|.*$/, "").replace(/\s*\.\s*$/, "").replace(/^(?:the|and)\s+/i, "").trim();
const norm = (s: string) => s.toLowerCase().replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "av").replace(/[^a-z0-9]/g, "");
const ref = (s: TroubleStation): TroubleStop => ({ id: s.gtfsId, name: s.name, at: [s.at[0], s.at[1]] });
const uniqBy = <T,>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()];

export const isActive = (a: FeedAlert, nowS: number) => {
  const ps = a.alert.active_period ?? [];
  return ps.length === 0 || ps.some((p) => (p.start ?? 0) <= nowS && nowS <= (p.end || Infinity));
};

export function troubleKind(alertType: string): TroubleKind {
  if (/^(severe )?delays$/i.test(alertType)) return "delay";
  if (/suspended/i.test(alertType)) return "suspended";
  if (/stops skipped/i.test(alertType)) return "skip";
  if (/reroute/i.test(alertType)) return "reroute";
  if (/reduced/i.test(alertType)) return "reduced";
  return "other";
}

/** Resolve an alert's station name: on `route` first (exact name, then the looser `sameStation`), else anywhere by exact name. */
export function findStation(name: string, stations: TroubleStation[], route?: string): TroubleStation | undefined {
  const n = norm(cleanName(name));
  if (!n) return undefined;
  const on = route ? stations.filter((s) => s.routes.includes(route)) : [];
  return on.find((s) => norm(s.name) === n) ?? on.find((s) => sameStation(cleanName(name), s.name)) ?? stations.find((s) => norm(s.name) === n);
}

/**
 * Stations a sentence names after "at", "near", "between" or "and", matched
 * by exact name only (longest run of words first), so a common word never
 * becomes a station.
 */
export function stationsNamedIn(text: string, stations: TroubleStation[], routes: string[]): TroubleStation[] {
  const on = stations.filter((s) => routes.some((r) => s.routes.includes(r)));
  const out: TroubleStation[] = [];
  for (const m of plainAlertText(text).matchAll(/\b(?:at|near|between|and)\s+([^.,;:\n()]+)/g)) {
    const words = m[1].trim().split(/\s+/).slice(0, 6);
    for (let k = words.length; k > 0; k--) {
      const hit = on.find((s) => norm(s.name) === norm(words.slice(0, k).join(" ")));
      if (hit) { out.push(hit); break; }
    }
  }
  return uniqBy(out, (s) => s.gtfsId);
}

/** Shuttle buses: route numbers, the "between A and B" ends (as names), and whether the alert mentions shuttle buses at all. */
export function shuttleOf(text: string): { any: boolean; buses: string[]; between: string[] } {
  const t = text.replace(/\[shuttle bus icon\]/gi, "");
  const any = /shuttle bus(?:es)?\b/i.test(t);
  const buses = [...new Set([...t.matchAll(/\b([A-Z]{1,3}\d{1,4})\s+shuttle bus/g)].map((m) => m[1]))];
  const between: string[] = [];
  const gap = /shuttle bus(?:es)? (?:make (?:all )?stops|run|operate)s? between\s+(.+?)\s+and\s+([^.\n]+)/i.exec(t) ?? (any ? /^No \[[A-Z0-9]+\](?: service| trains?)? between\s+(.+?)\s+and\s+([^.,\n]+)/im.exec(t) : null);
  if (gap) between.push(cleanName(gap[1]), cleanName(gap[2]));
  return { any, buses, between };
}

/** "[shuttle bus icon] Nostrand Av at Myrtle Av (to Bedford-Nostrand Avs)" → where + toward. */
export function shuttleNotes(notes: string): Array<{ where: string; toward: string | null }> {
  return notes.split("\n").flatMap((line) => {
    const m = /^\s*\[shuttle bus icon\]\s*(.+?)\s*(?:\(to ([^)]+)\))?\s*$/i.exec(line);
    return m ? [{ where: m[1].trim(), toward: m[2]?.trim() ?? null }] : [];
  });
}

/**
 * Where the train picks up again: "Transfer between [G] and [shuttle bus icon]
 * at X" (the line named there, which can differ from the suspended one) and
 * "Transfer at X to continue your trip" (`lines` empty: the alert's own line).
 */
export function rejoinNames(text: string): Array<{ name: string; lines: string[] }> {
  const out: Array<{ name: string; lines: string[] }> = [];
  for (const m of text.matchAll(/Transfer between ([^\n]*?shuttle bus[^\n]*?) at ([^.\n]+)/gi)) out.push({ name: cleanName(m[2]), lines: bullets(m[1]) });
  for (const m of text.matchAll(/Transfer at ([^.\n|]+?)(?:\s*\[[^\]]*\])* to continue your trip/gi)) out.push({ name: cleanName(m[1]), lines: [] });
  return uniqBy(out, (r) => r.name);
}

const bullets = (s: string) => [...s.matchAll(/\[([A-Z0-9]{1,3})\]/g)].map((m) => m[1]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "Church Av" from "… Church Av-bound [G] trains …" for route G. */
function boundFor(text: string, route: string): string | null {
  const m = new RegExp(`([A-Z][\\w.'/]*(?: [A-Z][\\w.'/]*){0,2})-bound (?:\\[[A-Z0-9]{1,3}\\])*\\[${escape(route)}\\]`).exec(text);
  return m ? m[1] : null;
}
const article = (s: string) => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`);

/**
 * Stations the text says trains still serve: "[G] runs between X and Y",
 * "Trains run every 20 minutes between X and Y", "1. Between X and Y", and
 * transfer points. Lines about shuttle buses are not train service.
 */
export function servedNames(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (/shuttle bus/i.test(line) || /^\s*No \[/i.test(line)) continue;
    const r = /(?:\b(?:runs?|operates?)(?: every \d+ minutes)?(?: only)?|^\s*\d+\.)\s+between\s+(.+?)\s+and\s+([^.,\n(]+)/i.exec(line);
    if (r) out.push(cleanName(r[1]), cleanName(r[2]));
    const t = /Transfer (?:between [^\n]*? )?at ([^.\n|]+?)(?:\s*\[[^\]]*\])*(?: to continue your trip)?\.?\s*$/i.exec(line);
    if (t) out.push(cleanName(t[1]));
  }
  return [...new Set(out.filter(Boolean))];
}

/**
 * Stations without this line's trains during a suspension. The entities list
 * every station the change touches, in line order, including a section where
 * trains still run less often; so take the headline's "No [G] between A and
 * B" stretch of that list (a missing end runs to the list's far end) and drop
 * the stations the text says are still served.
 */
export function suspendedStops(listed: TroubleStation[], header: string, served: Set<string>, route: string, stations: TroubleStation[]): TroubleStation[] {
  let part = listed;
  const r = /No \[[A-Z0-9]+\][^\n]*? between\s+(.+?)\s+and\s+([^.,\n]+)/i.exec(header);
  if (r) {
    const ids = listed.map((s) => s.gtfsId);
    const [ia, ib] = [r[1], r[2]].map((n) => ids.indexOf(findStation(n, stations, route)?.gtfsId ?? ""));
    const last = listed.length - 1;
    const ends = ia >= 0 && ib >= 0 ? [ia, ib] : ia >= 0 || ib >= 0 ? [Math.max(ia, ib), Math.max(ia, ib) === 0 ? last : 0] : [0, last];
    part = listed.slice(Math.min(...ends), Math.max(...ends) + 1);
  }
  return part.filter((s) => !served.has(s.gtfsId));
}

/**
 * The MTA's own direction-switch advice. Kept only when the train to board is
 * one of the lines just ridden, or "a … train": switching to another line is
 * a transfer, not a direction change.
 */
export function directionSwitches(text: string, stations: TroubleStation[]): Array<Omit<DirectionSwitch, "station"> & { station: TroubleStation }> {
  const out: Array<Omit<DirectionSwitch, "station"> & { station: TroubleStation }> = [];
  for (const line of text.split("\n")) {
    const m = /For service (to|from) [^,]+, take the ((?:\[[A-Z0-9]{1,3}\](?:\s*(?:or|and|,)\s*)?)+) to (.+?) and transfer to (?:an? )?(.+?)\.?\s*$/i.exec(line);
    if (m) {
      const ridden = bullets(m[2]);
      const target = bullets(m[4]);
      if (target.length && !target.every((r) => ridden.includes(r))) continue;
      for (const name of m[3].split(/\s+or\s+|,\s*/)) {
        const st = findStation(name, stations, ridden[0]);
        if (st) out.push({ station: st, board: article(plainAlertText(m[4])), why: m[1].toLowerCase() as "to" | "from", leaveStation: false });
      }
    }
    const x = /Transfer between (uptown and downtown|[\w -]+-bound and [\w -]+-bound) trains([^.\n]*?) at ([^.\n]+)/i.exec(line);
    if (x) {
      const st = findStation(x[3], stations);
      if (st) out.push({ station: st, board: `the other direction (${x[1]})`, why: "crossover", leaveStation: /omny|fare|re-?entry|exit|go ticket/i.test(x[2]) });
    }
  }
  return uniqBy(out, (d) => `${d.station.gtfsId}|${d.why}|${d.board}`);
}

/** The direction label riders see ("Coney Island-bound", "Downtown") for a GTFS direction id at a station. */
export function directionLabel(dir: number, st: TroubleStation | undefined): string | null {
  const label = dir === 0 ? st?.north : st?.south;
  if (!label || /^last stop$/i.test(label)) return null;
  return /^(uptown|downtown|northbound|southbound|outbound|inbound)$/i.test(label) ? label : `${label}-bound`;
}

/** One LineTrouble per route the alert names. Returns [] for an inactive alert. */
export function troubleFromAlert(a: FeedAlert, stations: TroubleStation[], nowS: number): LineTrouble[] {
  if (!isActive(a, nowS)) return [];
  const merc = a.alert["transit_realtime.mercury_alert"];
  const kind = troubleKind(merc?.alert_type ?? "");
  const header = en(a.alert.header_text);
  const all = `${header}\n${en(a.alert.description_text)}`;
  const ents = a.alert.informed_entity ?? [];
  const routes = [...new Set(ents.map((e) => e.route_id).filter((r): r is string => Boolean(r)))];
  const byId = new Map(stations.map((s) => [s.gtfsId, s]));
  const skipChanges = serviceChanges({ id: a.id, text: header, routes }).filter((c) => c.kind === "skip");
  const skipNames = [...new Set(skipChanges.flatMap((c) => c.names))];
  const sh = shuttleOf(all);
  const rejoinAt = rejoinNames(all);
  const servedAt = servedNames(all);
  const switches = directionSwitches(all, stations);
  const notes = (merc?.station_alternative ?? []).flatMap((s) => {
    const st = s.affected_entity?.stop_id ? byId.get(s.affected_entity.stop_id) : undefined;
    return st ? shuttleNotes(en(s.notes)).map((n) => ({ station: ref(st), ...n })) : [];
  });

  return routes.map((route) => {
    const mine = ents.filter((e) => e.route_id === route);
    const rejoin = uniqBy(rejoinAt.map((r) => findStation(r.name, stations, r.lines[0] ?? route)).filter((s): s is TroubleStation => Boolean(s)), (s) => s.gtfsId);
    const rejoinLine = rejoinAt.find((r) => r.lines.length)?.lines[0] ?? (rejoin.length ? route : null);
    let skipped: TroubleStation[] = [];
    if (kind === "suspended") {
      const listed = mine.flatMap((e) => (e.stop_id && byId.get(e.stop_id)) || []);
      const served = new Set([...rejoin.map((s) => s.gtfsId), ...servedAt.flatMap((n) => findStation(n, stations, route)?.gtfsId ?? [])]);
      skipped = suspendedStops(listed, header, served, route, stations);
    } else if (skipNames.length) {
      skipped = skipNames.map((n) => findStation(n, stations, route)).filter((s): s is TroubleStation => Boolean(s));
    }
    skipped = uniqBy(skipped, (s) => s.gtfsId);
    const dirs = [...new Set(mine.map((e) => e.direction_id).filter((d): d is number => d === 0 || d === 1))];
    // "some Coney Island-bound [F] and some Church Av-bound [G]": each line's own label first.
    const textDir = boundFor(header, route) ?? skipChanges.find((c) => c.route === route)?.toward ?? null;
    const direction = textDir ? `${textDir}-bound` : dirs.length === 1 ? directionLabel(dirs[0], skipped[0] ?? (mine[0]?.stop_id ? byId.get(mine[0].stop_id) : undefined)) : /^\s*(uptown|downtown)\b/i.exec(header)?.[1] ?? null;
    const between = sh.between.map((n) => findStation(n, stations, route)).filter((s): s is TroubleStation => Boolean(s));
    return {
      alertId: a.id,
      route,
      kind,
      headline: plainAlertText(header.replace(/\s*\n+\s*/g, ". ")),
      direction: direction ? direction[0].toUpperCase() + direction.slice(1) : null,
      partial: /\bsome\b[^.\n]*\btrains?\b/i.test(header),
      problemAt: kind === "delay" ? stationsNamedIn(header, stations, [route]).map(ref) : [],
      skipped: skipped.map(ref),
      shuttle: sh.any ? { buses: sh.buses, between: uniqBy(between, (s) => s.gtfsId).map(ref), stops: notes } : null,
      rejoin: rejoin.map(ref),
      rejoinLine,
      switchDirection: switches.filter((d) => d.station.routes.includes(route) || d.why === "crossover").map((d) => ({ ...d, station: ref(d.station) })),
    };
  });
}

/** Every active trouble on `routes`, one per alert and line. */
export function lineTroubles(alerts: FeedAlert[], stations: TroubleStation[], routes: string[], nowS: number): LineTrouble[] {
  const want = new Set(routes);
  return alerts.flatMap((a) => (a.alert.informed_entity ?? []).some((e) => e.route_id && want.has(e.route_id)) ? troubleFromAlert(a, stations, nowS).filter((t) => want.has(t.route)) : []);
}

/**
 * Which trains instead, at a skipped station: other lines listed at the same
 * station complex that no active trouble skips there. Lines are 39hk-dx4f's
 * daytime routes, so a weekday-only line can appear on a weekend.
 */
export function otherLinesAt(stop: TroubleStop, troubles: LineTrouble[], stations: TroubleStation[]): string[] {
  const complex = stations.find((s) => s.gtfsId === stop.id)?.complexId;
  if (!complex) return [];
  const here = stations.filter((s) => s.complexId === complex);
  const ids = new Set(here.map((s) => s.gtfsId));
  const out = new Set<string>();
  for (const s of here) for (const r of s.routes) {
    const blocked = troubles.some((t) => t.route === r && t.skipped.some((k) => ids.has(k.id)));
    if (!blocked) out.add(r);
  }
  return [...out].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/** One vehicle entry of the NYCT GTFS-rt feed, joined with its trip update. */
export interface LiveVehicle {
  tripId: string;
  route: string;
  /** Platform stop id with direction suffix, e.g. "Q01S". */
  stopId: string;
  /** currentStatus STOPPED_AT. */
  stopped: boolean;
  /** Vehicle timestamp: the last time its position was updated, unix seconds. */
  ts: number;
  /** Stops left in its trip update; 1 means it is at or nearing its last stop. */
  remaining: number;
  /** The trip has not left its first stop yet. */
  atOrigin: boolean;
}
export interface StuckTrain { tripId: string; route: string; station: TroubleStop; toward: string | null; stopped: boolean; stoppedMin: number }

/** Minutes without a position update before a train on a delayed line counts as stuck. */
export const STUCK_AFTER_S = 5 * 60;
/** Older than this is more likely a train out of service than a stuck one. */
const STUCK_MAX_S = 90 * 60;

export function stuckTrains(vehicles: LiveVehicle[], troubles: LineTrouble[], stations: TroubleStation[], nowS: number, minS = STUCK_AFTER_S): StuckTrain[] {
  const delayed = new Set(troubles.filter((t) => t.kind === "delay").map((t) => t.route));
  const byId = new Map(stations.map((s) => [s.gtfsId, s]));
  const out: StuckTrain[] = [];
  for (const v of vehicles) {
    const age = nowS - v.ts;
    if (!delayed.has(v.route) || v.ts <= 0 || age < minS || age > STUCK_MAX_S || v.remaining <= 1 || v.atOrigin) continue;
    const st = byId.get(v.stopId.replace(/[NS]$/, ""));
    if (!st) continue;
    const dir = v.stopId.endsWith("N") ? 0 : v.stopId.endsWith("S") ? 1 : null;
    // A terminal for this direction: trains wait there by design.
    if (dir !== null && /^last stop$/i.test((dir === 0 ? st.north : st.south) ?? "")) continue;
    out.push({ tripId: v.tripId, route: v.route, station: ref(st), toward: dir === null ? null : directionLabel(dir, st), stopped: v.stopped, stoppedMin: Math.floor(age / 60) });
  }
  return out.sort((a, b) => b.stoppedMin - a.stoppedMin);
}

/** A plain sentence for each trouble, for the model to rephrase (never the only place a fact lives). */
export function troubleSummary(t: LineTrouble): string {
  const parts = [`${t.route}: ${t.headline.replace(/([^.])$/, "$1.")}`];
  if (t.skipped.length) parts.push(`${t.partial ? "Some trains skip" : t.kind === "suspended" ? "No trains at" : "Skips"} ${t.skipped.map((s) => s.name).join(", ")}${t.direction ? ` (${t.direction})` : ""}.`);
  if (t.problemAt.length) parts.push(`Problem at ${t.problemAt.map((s) => s.name).join(", ")}.`);
  if (t.shuttle) {
    const ends = t.shuttle.between.map((s) => s.name);
    parts.push(`${t.shuttle.buses.length ? `${t.shuttle.buses.join(", ")} shuttle` : "Shuttle"} buses${ends.length === 2 ? ` run between ${ends[0]} and ${ends[1]}` : " replace the train"}.`);
  }
  if (t.rejoin.length) parts.push(`Get the ${t.rejoinLine ?? t.route} train back at ${t.rejoin.map((s) => s.name).join(" or ")}.`);
  for (const d of t.switchDirection) parts.push(d.why === "crossover" ? `Switch direction at ${d.station.name}${d.leaveStation ? " (you leave and re-enter; the MTA says use fare-capped OMNY)" : ""}.` : `To go ${d.why === "to" ? "to" : "from"} a skipped stop, switch at ${d.station.name} to ${d.board}.`);
  return parts.join(" ");
}
