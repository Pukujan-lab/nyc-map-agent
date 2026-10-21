/**
 * Answers deterministic intents (./intents) from the app's own feeds, with no
 * language model: live arrivals, line alerts, nearest restroom, weather,
 * directions hand-off and "follow the X train". Used for instant voice replies
 * and whenever the assistant is unavailable.
 */
import { fetchAddressSuggestions } from "@/lib/api/geosearch";
import type { LngLat } from "@/lib/api/routing";
import { parseIntent, type Catalog, type Intent } from "./intents";

// Minimal shapes of the transit feeds (features may not import each other).
interface StaticSubway {
  routes: Record<string, unknown>;
  stations: GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; name: string; routes: string }>;
}
interface LiveTrip { route: string; stops: Array<[string, number]> }
interface TransitAlert { kind: string; text: string; routes: string[] }

/** Next trains at a set of station ids: platform ids are station id + N (uptown) / S (downtown). */
function nextTrains(trips: LiveTrip[], ids: Set<string>, now: number) {
  const out: Array<{ route: string; direction: "Uptown" | "Downtown"; t: number }> = [];
  for (const trip of trips) {
    const hit = trip.stops.find(([stop, t]) => t >= now - 30 && ids.has(stop.slice(0, -1)));
    if (hit) out.push({ route: trip.route, direction: hit[0].endsWith("S") ? "Downtown" : "Uptown", t: hit[1] });
  }
  return out.sort((a, b) => a.t - b.t);
}
/** Where a train is now: the last stop it has passed (good enough to frame the camera). */
function lastStop(trip: LiveTrip, now: number): string | null {
  const passed = trip.stops.filter(([, t]) => t <= now);
  return (passed.at(-1) ?? trip.stops[0])?.[0].slice(0, -1) ?? null;
}

const API = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const json = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
};

let subway: Promise<StaticSubway> | null = null;
const staticSubway = () => (subway ??= json<StaticSubway>("/transit/subway.json").catch((e) => { subway = null; throw e; }));

async function loadCatalog(): Promise<Catalog> {
  const s = await staticSubway();
  return {
    stations: s.stations.features.map((f) => ({ id: f.properties.id, name: f.properties.name, routes: f.properties.routes.split(" ") })),
    routes: Object.keys(s.routes),
  };
}

export interface FallbackDeps {
  center: () => LngLat;
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  directionsTo: (p: LngLat) => void;
  follow: (route: string, at: LngLat) => void;
}
interface FallbackAnswer { intent: Intent; text: string }

const metres = (a: LngLat, b: LngLat) => Math.hypot((a.lon - b.lon) * 84_300, (a.lat - b.lat) * 111_000);
/** First sentence of an MTA alert: a short plain-language summary. */
const shortAlert = (text: string) => text.replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0].slice(0, 160);

async function answer(intent: Intent, deps: FallbackDeps): Promise<string> {
  switch (intent.kind) {
    case "stop": return "Stopped listening.";
    case "arrivals": {
      if (intent.mode === "bus") return `Bus arrivals by stop name aren't available yet. Turn on Transit and tap the stop near ${intent.place} for its next buses.`;
      if (!intent.stationId) return `I couldn't find a station called ${intent.place}.`;
      const [s, live] = await Promise.all([staticSubway(), json<{ trips: LiveTrip[] }>(`${API}/api/transit/subway`)]);
      const name = s.stations.features.find((f) => f.properties.id === intent.stationId)!.properties.name;
      const ids = new Set(s.stations.features.filter((f) => f.properties.name === name).map((f) => f.properties.id));
      const now = Date.now() / 1000;
      const rows = nextTrains(live.trips, ids, now)
        .filter((a) => (!intent.route || a.route === intent.route) && (!intent.direction || a.direction.toLowerCase() === intent.direction))
        .slice(0, 3);
      if (!rows.length) return `No ${intent.route ?? ""} ${intent.direction ?? ""} trains are predicted at ${name} right now.`.replace(/\s+/g, " ");
      return `At ${name}: ` + rows.map((a) => `${a.direction} ${a.route} in ${Math.floor((a.t - now) / 60) || "under 1"} min`).join(", ") + ".";
    }
    case "status": {
      const { alerts } = await json<{ alerts: TransitAlert[] }>(`${API}/api/transit/alerts`);
      const mine = alerts.filter((a) => a.routes.includes(intent.route));
      if (!mine.length) return `The ${intent.route} has no reported delays or service changes right now.`;
      const top = mine.find((a) => a.kind === "delay") ?? mine[0];
      return `${intent.route} train: ${shortAlert(top.text)}${mine.length > 1 ? ` Plus ${mine.length - 1} more notice${mine.length > 2 ? "s" : ""}.` : ""}`;
    }
    case "directions": {
      const [hit] = await fetchAddressSuggestions(intent.to);
      if (!hit) return `I couldn't find ${intent.to} in New York City.`;
      deps.directionsTo({ lon: hit.lon, lat: hit.lat });
      deps.flyTo(hit.lon, hit.lat, 15);
      return `Directions to ${hit.label} are on the map.`;
    }
    case "restroom": {
      const fc = await json<GeoJSON.FeatureCollection>(`${API}/api/restrooms`);
      const c = deps.center();
      let best: { d: number; at: [number, number]; props: GeoJSON.GeoJsonProperties } | null = null;
      for (const f of fc.features) {
        if (f.geometry?.type !== "Point") continue;
        const [lon, lat] = f.geometry.coordinates;
        const d = metres(c, { lon, lat });
        if (!best || d < best.d) best = { d, at: [lon, lat], props: f.properties };
      }
      if (!best) return "I couldn't find a public restroom nearby.";
      deps.flyTo(best.at[0], best.at[1], 17);
      const name = String(best.props?.name ?? best.props?.facility_name ?? "A public restroom");
      return `${name} is about ${Math.max(1, Math.round(best.d / 80))} minutes' walk from the map centre.`;
    }
    case "weather": {
      const c = deps.center();
      const w = await json<{ kind: string; tempC: number | null }>(`${API}/api/weather?lat=${c.lat.toFixed(3)}&lon=${c.lon.toFixed(3)}`);
      const f = w.tempC == null ? "" : `, ${Math.round(w.tempC * 1.8 + 32)}°F`;
      return `It's ${w.kind}${f} here right now.`;
    }
    case "follow": {
      const [s, live] = await Promise.all([staticSubway(), json<{ trips: LiveTrip[] }>(`${API}/api/transit/subway`)]);
      const c = deps.center();
      const now = Date.now() / 1000;
      const at = new Map(s.stations.features.map((f) => [f.properties.id, f.geometry.coordinates]));
      const trains = live.trips.filter((t) => t.route === intent.route)
        .map((t) => at.get(lastStop(t, now) ?? ""))
        .filter((p): p is GeoJSON.Position => !!p)
        .map(([lon, lat]) => ({ lon, lat }));
      if (!trains.length) return `No ${intent.route} trains are on the live feed right now.`;
      trains.sort((a, b) => metres(c, a) - metres(c, b));
      deps.follow(intent.route, trains[0]);
      return `Showing the nearest ${intent.route} train. Tap it, then Follow, to keep the camera on it.`;
    }
  }
}

/** Parse and answer; null when no deterministic intent matched. Feed errors become a short spoken line. */
export async function tryFallback(text: string, deps: FallbackDeps): Promise<FallbackAnswer | null> {
  let cat: Catalog;
  try { cat = await loadCatalog(); } catch { cat = { stations: [], routes: [] }; }
  const intent = parseIntent(text, cat);
  if (!intent) return null;
  try {
    return { intent, text: await answer(intent, deps) };
  } catch {
    return { intent, text: "That live feed isn't responding right now." };
  }
}
