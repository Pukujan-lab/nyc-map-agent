/**
 * Map action buttons for an answer (#371), built from the tool results the
 * agent already used. Deterministic: the model never writes these, so a
 * button can only draw data a tool returned.
 */
import { formatStreetText } from "../../../src/lib/streetName";
import { mapAction, MAX_ACTIONS, type MapAction, type MapPoint, type RestroomSpot, type Trip } from "../../../src/features/agent/schema";

const key = (at: readonly [number, number]) => `${at[0].toFixed(5)},${at[1].toFixed(5)}`;
const clip = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "Show Grand Central" for a place the agent looked up. The user's own spot gets no button. */
export function placeActions(place: { label: string; at: readonly [number, number] }): MapAction[] {
  if (/^your location$/i.test(place.label)) return [];
  const [lon, lat] = place.at;
  return [{ kind: "flyTo", id: `fly:${key(place.at)}`, label: `Show ${clip(formatStreetText(place.label))}`, lon, lat, zoom: 16 }];
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

const RANK: Record<MapAction["kind"], number> = { showRestroom: 0, showRoute: 1, showStops: 2, showCrashes: 2, flyTo: 3 };

/** Collects actions across a request's tool calls: deduped by id, validated, ranked, capped. */
export class ActionCollector {
  private byId = new Map<string, MapAction>();
  add(actions: MapAction[]): void {
    for (const a of actions) {
      const ok = mapAction.safeParse(a);
      if (ok.success) this.byId.set(a.id, ok.data);
    }
  }
  list(): MapAction[] {
    // Skipped stops before a plain stop list: the trouble first.
    const rank = (a: MapAction) => RANK[a.kind] + (a.kind === "showStops" && !a.skipped ? 0.5 : 0);
    return [...this.byId.values()].map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).slice(0, MAX_ACTIONS).map((x) => x.a);
  }
}
