/**
 * Live MTA feeds, proxied and slimmed for the map. GTFS-rt protobuf is decoded
 * with the official gtfs-realtime-bindings and cached in memory ~15 s, so a
 * room full of browsers costs MTA one request per feed per 15 s.
 *
 *   /api/transit          → { bus: boolean } (is MTA_BUSTIME_KEY set?)
 *   /api/transit/subway|lirr|mnr → trips with upcoming stop times
 *   /api/transit/bus      → bus vehicle positions (404 without the key)
 *   /api/transit/alerts   → MTA service alerts + elevator/escalator outages
 *   /api/transit/bus-trip?vehicle=&route= → one bus: headsign + upcoming stops with ETAs (SIRI)
 *   /api/transit/bus-route?route=        → one route's shape + stops, on demand (Bus Time OBA)
 */
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { json } from "../../../api/_lib/http";

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
const MTA = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/";
const FEEDS: Record<string, string[]> = {
  subway: ["gtfs", "gtfs-ace", "gtfs-bdfm", "gtfs-g", "gtfs-jz", "gtfs-nqrw", "gtfs-l", "gtfs-si"].map((f) => `${MTA}nyct%2F${f}`),
  lirr: [`${MTA}lirr%2Fgtfs-lirr`],
  mnr: [`${MTA}mnr%2Fgtfs-mnr`],
};
const TTL = 15_000;
const cache = new Map<string, { at: number; body: Promise<unknown> }>();

function cached(key: string, load: () => Promise<unknown>, ttl = TTL): Promise<unknown> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.body;
  // Per-vehicle keys come and go; drop stale ones so the map cannot grow without bound.
  if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at > 6 * 3600_000 || (k.startsWith("bus-trip:") && Date.now() - v.at > TTL)) cache.delete(k);
  const body = load();
  cache.set(key, { at: Date.now(), body });
  body.catch(() => cache.delete(key));
  return body;
}

async function decode(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export type TransitTrip = {
  id: string;
  route: string;
  dir: number | null;
  /** Upcoming (and just-passed) stops: [stopId, unix seconds]. */
  stops: Array<[string, number]>;
  /** Vehicle-reported current stop, if any. */
  at?: string;
};

async function loadTrips(system: string) {
  const feeds = await Promise.allSettled(FEEDS[system].map(decode));
  const trips: TransitTrip[] = [];
  const now = Date.now() / 1000;
  for (const f of feeds) {
    if (f.status !== "fulfilled") continue;
    const at = new Map<string, string>();
    for (const e of f.value.entity) {
      const v = e.vehicle;
      if (v?.trip?.tripId && v.stopId) at.set(v.trip.tripId, v.stopId);
    }
    for (const e of f.value.entity) {
      const tu = e.tripUpdate;
      if (!tu?.trip) continue;
      const stops: Array<[string, number]> = [];
      for (const s of tu.stopTimeUpdate ?? []) {
        const t = num(s.arrival?.time) || num(s.departure?.time);
        if (s.stopId && t && t > now - 600) stops.push([s.stopId, t]);
      }
      if (!stops.length) continue;
      const tripId = tu.trip.tripId ?? e.id;
      // NYCT trip ids carry the direction (..N / ..S); rail uses direction_id.
      const m = /\.\.?([NS])/.exec(tripId);
      const dir = tu.trip.directionId ?? (m ? (m[1] === "N" ? 0 : 1) : null);
      trips.push({ id: tripId, route: tu.trip.routeId ?? "", dir, stops, at: at.get(tripId) });
    }
  }
  if (feeds.every((f) => f.status === "rejected")) throw new Error(`all ${system} feeds failed`);
  return { at: Math.round(now), trips };
}

async function loadBuses(key: string) {
  const url = `https://gtfsrt.prod.obanyc.com/vehiclePositions?${new URLSearchParams({ key })}`;
  const feed = await decode(url);
  const buses = [];
  for (const e of feed.entity) {
    const v = e.vehicle;
    if (!v?.position) continue;
    buses.push({
      id: v.vehicle?.id ?? e.id,
      route: (v.trip?.routeId ?? "").replace(/^MTA NYCT_|^MTABC_/, ""),
      dir: v.trip?.directionId ?? null,
      lon: Math.round(v.position.longitude * 1e5) / 1e5,
      lat: Math.round(v.position.latitude * 1e5) / 1e5,
      bearing: v.position.bearing ?? null,
      next: v.stopId ?? null,
      t: num(v.timestamp),
    });
  }
  return { at: Math.round(Date.now() / 1000), buses };
}

type MercuryAlert = {
  id: string;
  alert: {
    active_period?: Array<{ start?: number; end?: number }>;
    informed_entity?: Array<{ agency_id?: string; route_id?: string; stop_id?: string }>;
    header_text?: { translation?: Array<{ text: string; language: string }> };
    "transit_realtime.mercury_alert"?: { alert_type?: string };
  };
};

async function loadAlerts() {
  const get = (path: string) => fetch(`${MTA}${path}`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json());
  const [alertsRes, eneRes, equipRes] = await Promise.allSettled([
    get("camsys%2Fall-alerts.json"),
    get("nyct%2Fnyct_ene.json"),
    cached("equipment", () => get("nyct%2Fnyct_ene_equipments.json")),
  ]);
  const now = Date.now() / 1000;
  const alerts = [];
  if (alertsRes.status === "fulfilled") {
    for (const e of (alertsRes.value as { entity: MercuryAlert[] }).entity ?? []) {
      const a = e.alert;
      const active = (a.active_period ?? []).some((p) => (p.start ?? 0) <= now && (!p.end || p.end >= now));
      if (!active) continue;
      const type = a["transit_realtime.mercury_alert"]?.alert_type ?? "";
      const text = a.header_text?.translation?.find((t) => t.language === "en")?.text ?? "";
      const planned = /^planned/i.test(type) || /maintenance|track work|repairs|construction/i.test(text);
      const kind = planned ? "planned" : /delay|reduced/i.test(type) ? "delay" : "notice";
      // Reroutes / skipped stops: the informed stops are the ones affected.
      const reroute = /reroute|detour|skipped|express to local|local to express|suspend/i.test(type) || /running via|skip|bypass/i.test(text);
      const ents = a.informed_entity ?? [];
      alerts.push({
        id: e.id,
        kind,
        type,
        reroute,
        text,
        agency: ents[0]?.agency_id ?? "",
        routes: [...new Set(ents.map((x) => x.route_id).filter(Boolean))],
        stops: [...new Set(ents.map((x) => x.stop_id).filter(Boolean))],
      });
    }
  }
  // Elevator / escalator outages, placed by the equipment list's GTFS stop ids.
  type Row = Record<string, string>;
  const equipment = new Map<string, Row>();
  if (equipRes.status === "fulfilled" && Array.isArray(equipRes.value)) {
    for (const q of equipRes.value as Row[]) equipment.set(q.equipmentno, q);
  }
  const current = eneRes.status === "fulfilled" && Array.isArray(eneRes.value) ? (eneRes.value as Row[]).filter((o) => o.isupcomingoutage !== "Y") : [];
  const outNow = new Set(current.map((o) => o.equipment));
  const stopsOf = (q?: Row) => (q?.elevatorsgtfsstopid ?? "").split(/[/,; ]+/).filter(Boolean);
  const outages = current.map((o) => {
    const q = equipment.get(o.equipment);
    const stops = stopsOf(q);
    const isElevator = o.equipmenttype === "EL";
    // Still accessible if another active ADA elevator serves the same stop and is not out, or the unit is redundant.
    const adaStation = [...equipment.values()].some((x) => x.ADA === "Y" && stopsOf(x).some((s) => stops.includes(s)));
    const backup = [...equipment.values()].some((x) => x.equipmentno !== o.equipment && x.equipmenttype === "EL" && x.ADA === "Y" && x.isactive === "Y" && !outNow.has(x.equipmentno) && stopsOf(x).some((s) => stops.includes(s)));
    return {
      id: o.equipment,
      station: o.station,
      routes: (o.trainno ?? "").split("/").filter(Boolean),
      stops,
      equipment: isElevator ? "Elevator" : "Escalator",
      serving: o.serving,
      reason: o.reason,
      since: o.outagedate,
      back: o.estimatedreturntoservice,
      ada: adaStation ? (!isElevator || backup || Number(q?.redundant) === 1 ? "yes" : "no") : "not-ada",
      alternative: q?.alternativeroute ?? "",
    };
  });
  return { at: Math.round(now), alerts, outages };
}

const BUSTIME = "https://bustime.mta.info/api/";
const ROUTE_RE = /^[A-Z]{1,3}\d{1,3}[A-Z+]{0,2}$/i;
const VEHICLE_RE = /^[\w .-]{1,40}$/;
const first = (v: unknown): string => {
  const x: unknown = Array.isArray(v) ? v[0] : v;
  return typeof x === "string" || typeof x === "number" ? String(x) : "";
};

/** Google encoded polyline → [lon, lat] pairs. */
export function decodePolyline(str: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d; else lon += d;
    }
    out.push([lon / 1e5, lat / 1e5]);
  }
  return out;
}

type SiriCall = { StopPointRef?: string; StopPointName?: unknown; ExpectedArrivalTime?: string; AimedArrivalTime?: string; Extensions?: { Distances?: { PresentableDistance?: string } } };
async function loadBusTrip(key: string, vehicle: string) {
  const qs = new URLSearchParams({ key, VehicleRef: vehicle, VehicleMonitoringDetailLevel: "calls", MaximumNumberOfCallsOnwards: "40" });
  const r = await fetch(`${BUSTIME}siri/vehicle-monitoring.json?${qs}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`bus-trip upstream ${r.status}`);
  const d = (await r.json()) as { Siri?: { ServiceDelivery?: { VehicleMonitoringDelivery?: Array<{ VehicleActivity?: Array<{ MonitoredVehicleJourney: Record<string, unknown> }> }> } } };
  const j = d.Siri?.ServiceDelivery?.VehicleMonitoringDelivery?.[0]?.VehicleActivity?.[0]?.MonitoredVehicleJourney;
  if (!j) return { found: false };
  const calls = ((j.OnwardCalls as { OnwardCall?: SiriCall[] } | undefined)?.OnwardCall ?? []).map((c) => {
    const t = Date.parse(c.ExpectedArrivalTime ?? c.AimedArrivalTime ?? "");
    return { id: c.StopPointRef ?? "", name: first(c.StopPointName), eta: Number.isFinite(t) ? Math.round(t / 1000) : null, away: c.Extensions?.Distances?.PresentableDistance ?? "" };
  });
  return { found: true, route: first(j.PublishedLineName), destination: first(j.DestinationName), dir: first(j.DirectionRef), calls };
}

async function loadBusRoute(key: string, route: string) {
  for (const agency of ["MTA NYCT", "MTABC"]) {
    const r = await fetch(`${BUSTIME}where/stops-for-route/${encodeURIComponent(`${agency}_${route}`)}.json?${new URLSearchParams({ key, includePolylines: "true", version: "2" })}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) continue;
    const d = (await r.json()) as { code?: number; data?: { entry?: { polylines?: Array<{ points: string }> }; references?: { stops?: Array<{ id: string; name: string; lat: number; lon: number; routeIds?: string[] }> } } };
    const lines = (d.data?.entry?.polylines ?? []).map((p) => decodePolyline(p.points)).filter((l) => l.length > 1);
    if (!lines.length) continue;
    const id = `${agency}_${route}`;
    const stops = (d.data?.references?.stops ?? []).filter((s) => !s.routeIds || s.routeIds.includes(id)).map((s) => ({ id: s.id, name: s.name, lon: s.lon, lat: s.lat }));
    return { route, lines, stops };
  }
  return { route, lines: [], stops: [] };
}

export async function GET(request: Request): Promise<Response> {
  const system = new URL(request.url).pathname.replace(/^\/api(?:\/v1)?\/transit\/?/, "");
  const busKey = process.env.MTA_BUSTIME_KEY;
  try {
    if (!system) return json({ bus: Boolean(busKey) }, { maxAge: 60, browserMaxAge: 60 });
    if (system === "bus") {
      if (!busKey) return json({ error: "bus_unavailable" }, { status: 404 });
      return json(await cached("bus", () => loadBuses(busKey)), { maxAge: 15, browserMaxAge: 10 });
    }
    if (system === "bus-trip" || system === "bus-route") {
      if (!busKey) return json({ error: "bus_unavailable" }, { status: 404 });
      const q = new URL(request.url).searchParams;
      const route = (q.get("route") ?? "").toUpperCase();
      if (route && !ROUTE_RE.test(route)) return json({ error: "bad_route" }, { status: 400 });
      if (system === "bus-route") {
        if (!route) return json({ error: "bad_route" }, { status: 400 });
        return json(await cached(`bus-route:${route}`, () => loadBusRoute(busKey, route), 6 * 3600_000), { maxAge: 3600, browserMaxAge: 3600 });
      }
      const vehicle = q.get("vehicle") ?? "";
      if (!VEHICLE_RE.test(vehicle)) return json({ error: "bad_vehicle" }, { status: 400 });
      return json(await cached(`bus-trip:${vehicle}`, () => loadBusTrip(busKey, vehicle)), { maxAge: 15, browserMaxAge: 10 });
    }
    if (system === "alerts") return json(await cached("alerts", loadAlerts), { maxAge: 60, browserMaxAge: 30 });
    if (!(system in FEEDS)) return json({ error: "unknown_system" }, { status: 404 });
    return json(await cached(system, () => loadTrips(system)), { maxAge: 15, browserMaxAge: 10 });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return json({ error: "upstream_error" }, { status: 502 });
  }
}
