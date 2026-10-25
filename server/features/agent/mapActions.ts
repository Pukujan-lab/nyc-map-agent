/**
 * Map action buttons for an answer (#371), built from the tool results the
 * agent already used. Deterministic: the model never writes these, so a
 * button can only draw data a tool returned.
 */
import { formatStreetText } from "../../../src/lib/streetName";
import { mapAction, MAX_ACTIONS, type MapAction, type MapPoint, type RestroomSpot, type Trip } from "../../../src/features/agent/schema";
import type { LineTrouble, StuckTrain } from "../../../src/lib/transit/trouble";

const key = (at: readonly [number, number]) => `${at[0].toFixed(5)},${at[1].toFixed(5)}`;
const clip = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The name before the address: "Bryant Park, Manhattan Community Board 5, …" → "Bryant Park"; a bare house number keeps its street. */
export function placeName(label: string): string {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return label;
  return /^\d+[a-z]?$/i.test(parts[0]) && parts[1] ? `${parts[0]} ${parts[1]}` : parts[0];
}

/** "Show Grand Central" for a place the agent looked up. The user's own spot gets no button. */
export function placeActions(place: { label: string; at: readonly [number, number] }): MapAction[] {
  if (/^your location$/i.test(place.label)) return [];
  const [lon, lat] = place.at;
  return [{ kind: "flyTo", id: `fly:${key(place.at)}`, label: `Show ${clip(formatStreetText(placeName(place.label)))}`, lon, lat, zoom: 16 }];
}

/** The nearest restroom (and the next one, if any) with its card. */
export function restroomActions(spots: RestroomSpot[]): MapAction[] {
  return spots.slice(0, 2).map((r, i) => ({
    kind: "showRestroom",
    id: `restroom:${key([r.lon, r.lat])}`,
    label: i === 0 ? "Show the nearest restroom" : "Show the next closest restroom",
    restroom: r,
  }));
}

/** One "Show the stops the L skips" button per line. */
export function skipActions(skips: Trip["skips"]): MapAction[] {
  const skipsByRoute = new Map<string, MapPoint[]>();
  for (const s of skips) skipsByRoute.set(s.route, [...(skipsByRoute.get(s.route) ?? []), { at: s.at, name: s.toward ? `${s.name} (${s.toward}-bound)` : s.name }]);
  return [...skipsByRoute].map(([route, stops]) => ({ kind: "showStops", id: `skips:${route}`, label: `Show the stops the ${route} skips`, route, skipped: true, stops }));
}

/** Route, skipped stations, crash hotspots, then each line's stops. */
export function tripActions(trip: Trip): MapAction[] {
  const out: MapAction[] = [{ kind: "showRoute", id: `route:${trip.id}`, label: trip.mode === "drive" ? "Show the drive" : trip.mode === "walk" ? "Show the walk" : "Show the route", trip }];
  // Second, so the button cap never drops it; only for a trip planned ahead, as one starting now needs no reminder.
  if (trip.scheduled?.future) out.push({ kind: "remindTrip", id: `remind:${trip.id}`, label: "Remind me", trip });
  out.push(...skipActions(trip.skips));
  const crashes = trip.context.filter((c) => c.kind === "crashes" && c.at).map((c) => ({ at: c.at!, name: c.text }));
  if (crashes.length) out.push({ kind: "showCrashes", id: `crashes:${trip.id}`, label: "Show crashes on this route", points: crashes });
  for (const l of trip.legs) {
    if (l.kind !== "ride") continue;
    const ends: MapPoint[] = [{ at: l.coords[0], name: l.fromStop ?? "Board here" }];
    const stops = [...ends, ...l.stops.map((s) => ({ at: s.at, name: s.text }))];
    if (l.toStop && !l.stops.some((s) => s.text === l.toStop)) stops.push({ at: l.coords[l.coords.length - 1], name: l.toStop });
    out.push({ kind: "showStops", id: `stops:${l.route}:${key(l.coords[0])}`, label: `Show ${l.route} stops`, route: l.route, color: l.color, skipped: false, stops: stops.slice(0, 200) });
  }
  return out;
}

const dedupePoints = (ps: MapPoint[]) => [...new Map(ps.map((p) => [`${p.name}|${key(p.at)}`, p])).values()];

/**
 * Buttons for MTA trouble (#361), in the order a rider needs them: a stuck
 * train, where the problem is, skipped stations, the shuttle buses (ends,
 * boarding spots in the MTA's words, where the train picks up again), and
 * where the MTA says to switch direction. Every point is a station the data
 * placed; a shuttle stop is drawn at its station, labelled with the corner.
 */
export function troubleActions(troubles: LineTrouble[], stuck: StuckTrain[] = []): MapAction[] {
  const out: MapAction[] = [];
  for (const s of stuck.slice(0, 2)) {
    out.push({ kind: "showTrouble", id: `trouble:stuck:${s.tripId}`, label: `Show the stuck ${s.route} train`, route: s.route, style: "stuck", points: [{ at: s.station.at, name: `${s.route} train${s.toward ? ` (${s.toward})` : ""} not moving for ${s.stoppedMin} min ${s.stopped ? "at" : "before"} ${s.station.name}` }] });
  }
  const byRoute = (pick: (t: LineTrouble) => MapPoint[]) => {
    const m = new Map<string, MapPoint[]>();
    for (const t of troubles) { const ps = pick(t); if (ps.length) m.set(t.route, [...(m.get(t.route) ?? []), ...ps]); }
    return [...m].map(([route, ps]) => [route, dedupePoints(ps)] as const);
  };
  for (const [route, points] of byRoute((t) => t.problemAt.map((s) => ({ at: s.at, name: `Problem at ${s.name}` })))) {
    out.push({ kind: "showTrouble", id: `trouble:problem:${route}`, label: `Show where the ${route} problem is`, route, style: "problem", points });
  }
  for (const [route, stops] of byRoute((t) => t.skipped.map((s) => ({ at: s.at, name: t.direction ? `${s.name} (${t.direction})` : s.name })))) {
    out.push({ kind: "showStops", id: `skips:${route}`, label: `Show the stops the ${route} skips`, route, skipped: true, stops: stops.slice(0, 200) });
  }
  const shuttles = new Set<string>();
  for (const t of troubles) {
    if (!t.shuttle || shuttles.has(t.alertId)) continue;
    shuttles.add(t.alertId);
    const points = dedupePoints([
      ...t.shuttle.between.map((s) => ({ at: s.at, name: `Shuttle buses end at ${s.name}` })),
      ...t.shuttle.stops.map((s) => ({ at: s.station.at, name: `Shuttle bus: ${s.where}${s.toward ? ` (to ${s.toward})` : ""}` })),
      ...t.rejoin.map((s) => ({ at: s.at, name: `Get the ${t.rejoinLine ?? t.route} train at ${s.name}` })),
    ]);
    if (points.length) out.push({ kind: "showTrouble", id: `trouble:shuttle:${t.alertId}`, label: `Show the ${t.route} shuttle buses`, route: t.route, style: "shuttle", points: points.slice(0, 200) });
  }
  for (const [route, points] of byRoute((t) => t.switchDirection.map((d) => ({ at: d.station.at, name: d.why === "crossover" ? `Switch direction at ${d.station.name}${d.leaveStation ? " (leave and re-enter)" : ""}` : `At ${d.station.name}, board ${d.board}` })))) {
    out.push({ kind: "showTrouble", id: `trouble:switch:${route}`, label: `Where to switch direction on the ${route}`, route, style: "switch", points });
  }
  return out;
}

const RANK: Record<MapAction["kind"], number> = { showRestroom: 0, showRoute: 1, remindTrip: 1, showTrouble: 2, showStops: 2, showCrashes: 2, flyTo: 3 };

/** Collects actions across a request's tool calls: deduped by id, validated, ranked, capped. */
const GENERIC = new Set(["show", "street", "avenue", "road", "place", "boulevard", "new", "york", "nyc", "the", "and", "east", "west", "north", "south"]);
const words = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !GENERIC.has(w));
/**
 * Does the answer stand behind this place? Its name (before the first comma)
 * must mostly appear in the answer. A geocoder leftover the answer calls
 * unrelated ("3 YACHT CLUB CV, Staten Island" for "the 3 Percent Club") fails.
 */
export function answerNames(answer: string, label: string): boolean {
  const name = label.replace(/^Show\s+/i, "").split(",")[0];
  const need = words(name);
  if (!need.length) return true;
  const have = new Set(words(answer));
  return need.filter((w) => have.has(w)).length / need.length >= 0.6;
}

export class ActionCollector {
  private byId = new Map<string, MapAction>();
  add(actions: MapAction[]): void {
    for (const a of actions) {
      const ok = mapAction.safeParse(a);
      if (ok.success) this.byId.set(a.id, ok.data);
    }
  }
  /** The buttons to show; with the answer's text, a "Show <place>" button stays only if the answer names that place. */
  list(answer?: string): MapAction[] {
    // Skipped stops before a plain stop list: the trouble first.
    const rank = (a: MapAction) => RANK[a.kind] + (a.kind === "showStops" && !a.skipped ? 0.5 : 0);
    return [...this.byId.values()].filter((a) => answer === undefined || a.kind !== "flyTo" || answerNames(answer, a.label)).map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).slice(0, MAX_ACTIONS).map((x) => x.a);
  }
}
