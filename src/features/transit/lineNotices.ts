import type { HeldTrain } from "@/lib/transit/holds";
import { lineOf } from "@/lib/transit/selectedLine";
import { plainAlertText, stationsNamedIn, type TroubleStation } from "@/lib/transit/trouble";
import { alertGeometry } from "./alertFocus";
import type { Outage, TransitAlert } from "./hooks";
import { stationOf, type StaticSystem } from "./model";

/**
 * One line's notices for the line panel (#370): the MTA alerts the app already
 * loads plus elevator and escalator outages, each with the stations it
 * touches so a tap can ring them on the map. Pure.
 */
export type NoticeTone = "delay" | "work" | "access" | "notice";
export interface NoticeStation { id: string; name: string; coord: [number, number]; label: string }
export interface LineNotice {
  id: string;
  tone: NoticeTone;
  title: string;
  /** When and where, short: "Uptown · Delays · since 3:10 PM". */
  meta: string;
  body: string;
  stations: NoticeStation[];
  /** The MTA alert behind it, so the map can draw the affected stretch (alert focus). */
  alert?: TransitAlert;
}

/** Dot, ring and glow colours per tone (from the agreed design). */
export const TONE: Record<NoticeTone, { dot: string; color: string; glow: string }> = {
  delay: { dot: "#f59e0b", color: "#f59e0b", glow: "rgba(245,158,11,0.28)" },
  work: { dot: "#94a3b8", color: "#cbd5e1", glow: "rgba(203,213,225,0.22)" },
  access: { dot: "#60a5fa", color: "#93c5fd", glow: "rgba(147,197,253,0.25)" },
  notice: { dot: "#94a3b8", color: "#cbd5e1", glow: "rgba(203,213,225,0.22)" },
};

/** Most stations a notice rings; a whole-line notice rings none. */
const MAX_RINGS = 12;
const ORDER: Record<NoticeTone, number> = { delay: 0, work: 1, access: 2, notice: 3 };

const clock = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const day = (t: number) => new Date(t * 1000).toLocaleDateString([], { month: "short", day: "numeric" });

function toneOf(a: TransitAlert): NoticeTone {
  if (a.kind === "delay") return "delay";
  if (a.kind === "planned" || a.reroute || a.changes?.some((c) => c.kind === "skip")) return "work";
  return "notice";
}

function whenOf(a: TransitAlert, nowS: number): string {
  if (a.period) return a.period;
  if (a.start && a.start <= nowS && a.kind === "delay") return `since ${clock(a.start)}`;
  if (a.end) return `until ${day(a.end)}`;
  return "";
}

/** The station list as the trouble reader (#386) takes it. */
export function troubleStations(sys: StaticSystem): TroubleStation[] {
  return sys.stations.features.map((f) => ({
    gtfsId: String(f.properties.id),
    complexId: String(f.properties.id),
    name: String(f.properties.name),
    routes: String(f.properties.routes ?? "").split(/[\s,]+/).filter(Boolean),
    at: f.geometry.coordinates as [number, number],
  }));
}

function alertStations(a: TransitAlert, sys: StaticSystem, route: string, tone: NoticeTone, stations: TroubleStation[]): NoticeStation[] {
  if (tone === "delay") {
    // Where the problem is, only when the headline names a station (the trouble reader's rule).
    return stationsNamedIn(a.text, stations, [route]).map((s) => ({ id: s.gtfsId, name: s.name, coord: [s.at[0], s.at[1]], label: "Delays" }));
  }
  const skips = a.changes?.some((c) => c.kind === "skip") || (a.skipNames?.length ?? 0) > 0;
  const geo = alertGeometry({ ...a, routes: a.routes.filter((r) => lineOf(r) === route) }, sys);
  const label = skips ? "Skipped" : a.kind === "planned" ? "Work" : "Affected";
  return geo.skipped.map((s) => ({ ...s, label }));
}

function outageNotice(o: Outage, sys: StaticSystem): LineNotice | null {
  const byId = new Map(sys.stations.features.map((f) => [String(f.properties.id), f]));
  const st = o.stops.map((s) => byId.get(stationOf("subway", s))).find(Boolean);
  const where = o.serving ? `${o.serving}` : o.equipment;
  const until = o.back ? ` · until ${o.back}` : "";
  return {
    id: `outage:${o.id}`,
    tone: "access",
    title: `${o.equipment} out at ${o.station}`,
    meta: `${where}${until}`,
    body: [o.reason ? `${o.equipment} out of service: ${o.reason.toLowerCase()}.` : `${o.equipment} out of service.`, o.alternative].filter(Boolean).join(" "),
    stations: st ? [{ id: String(st.properties.id), name: String(st.properties.name), coord: st.geometry.coordinates as [number, number], label: `No ${o.equipment.toLowerCase()}` }] : [],
  };
}

export function lineNotices(route: string, alerts: TransitAlert[], outages: Outage[], sys: StaticSystem | undefined, nowS = Date.now() / 1000): LineNotice[] {
  if (!sys) return [];
  const stations = troubleStations(sys);
  const out: LineNotice[] = [];
  const seen = new Set<string>();
  for (const a of alerts) {
    if (a.agency !== "MTASBWY" || !a.routes.some((r) => lineOf(r) === route) || seen.has(a.id)) continue;
    seen.add(a.id);
    const tone = toneOf(a);
    const title = plainAlertText(a.text.replace(/\s*\n+\s*/g, ". "));
    const label = a.reroute ? "Detour" : a.kind === "delay" ? "Delays" : a.kind === "planned" ? "Planned work" : "";
    const meta = [a.direction, label, whenOf(a, nowS)].filter(Boolean).join(" · ");
    const body = a.description ? plainAlertText(a.description) : title;
    const rings = alertStations(a, sys, route, tone, stations);
    out.push({ id: a.id, tone, title, meta, body, stations: rings.length > MAX_RINGS ? [] : rings, alert: a });
  }
  const outageSeen = new Set<string>();
  for (const o of outages) {
    if (!o.routes.some((r) => lineOf(r) === route) || outageSeen.has(o.id)) continue;
    outageSeen.add(o.id);
    const n = outageNotice(o, sys);
    if (n) out.push(n);
  }
  return out.sort((x, y) => ORDER[x.tone] - ORDER[y.tone]);
}

/**
 * Held trains on one line as notices (PROJECT.md goal 5: "tell you when a
 * train is stuck and exactly where"): which train, where, toward where and for
 * how long, with its station ringed on the map. Longest hold first.
 */
export function heldNotices(route: string, held: Iterable<HeldTrain>, sys: StaticSystem | undefined, nowS = Date.now() / 1000): LineNotice[] {
  if (!sys) return [];
  const byId = new Map(sys.stations.features.map((f) => [String(f.properties.id), f]));
  const out: Array<{ since: number; notice: LineNotice }> = [];
  for (const h of held) {
    if (lineOf(h.route) !== route) continue;
    const st = byId.get(stationOf("subway", h.stop));
    if (!st) continue;
    const name = String(st.properties.name);
    const toward = byId.get(stationOf("subway", h.toward))?.properties.name;
    const min = Math.max(1, Math.floor((nowS - h.since) / 60));
    out.push({ since: h.since, notice: {
      id: `held:${h.tripId}`,
      tone: "delay",
      title: `${route} train held ${h.stopped ? "at" : "before"} ${name}`,
      meta: [toward ? `To ${toward}` : "", `${min} min`].filter(Boolean).join(" · "),
      body: h.stopped
        ? `The live feed shows this train stopped at ${name} for ${min} min, past its expected time.`
        : `The live feed shows this train has not reached ${name} for ${min} min; its arrival time keeps moving later.`,
      stations: [{ id: String(st.properties.id), name, coord: st.geometry.coordinates as [number, number], label: "Held" }],
    } });
  }
  return out.sort((a, b) => a.since - b.since).map((x) => x.notice);
}
