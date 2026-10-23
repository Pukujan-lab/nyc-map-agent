/**
 * GET /api/ferry : NYC Ferry + Staten Island Ferry for the map, read from the
 * self-hosted OpenTripPlanner (docs/OTP.md), which already holds both GTFS
 * feeds and the NYC Ferry GTFS-rt vehicle positions. Returns route lines,
 * terminals/piers, and vessels: live positions where the feed has them,
 * otherwise schedule-based estimates (linear between consecutive stops).
 * Cached 30 s.
 */
import { z } from "zod";
import { fail, json } from "../../../api/_lib/http";
import { cached } from "../../lib/ttlCache";

const OTP_URL = (process.env.OTP_URL ?? "http://nyc-map-otp:8080").replace(/\/$/, "");
const TZ = "America/New_York";

const ll = z.object({ lat: z.number(), lon: z.number() });
const st = z.object({ scheduledDeparture: z.number(), scheduledArrival: z.number(), serviceDay: z.number(), stop: ll });
const schema = z.object({ data: z.object({ routes: z.array(z.object({
  gtfsId: z.string(), shortName: z.string().nullable(), longName: z.string().nullable(), color: z.string().nullable(),
  patterns: z.array(z.object({
    geometry: z.array(ll).nullable(),
    stops: z.array(ll.extend({ gtfsId: z.string(), name: z.string() })),
    vehiclePositions: z.array(ll.extend({ vehicleId: z.string().nullable(), label: z.string().nullable(), heading: z.number().nullable(), lastUpdated: z.number().nullable() })).nullable(),
    tripsForDate: z.array(z.object({ gtfsId: z.string(), stoptimes: z.array(st).nullable() })),
  })),
})) }) });
type Otp = z.infer<typeof schema>["data"];

export interface FerryVessel { id: string; route: string; lon: number; lat: number; heading: number | null; source: "live" | "schedule" }
export interface FerryData { routes: GeoJSON.FeatureCollection; terminals: GeoJSON.FeatureCollection; vessels: FerryVessel[] }

const nyDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const name = (r: Otp["routes"][number]) => (r.longName ?? r.shortName ?? r.gtfsId).replace(/\s+Ferry$/i, " Ferry");

/** Where a scheduled trip is at `now` (unix s), or null when it is not running. */
export function estimate(stoptimes: z.infer<typeof st>[], now: number): { lon: number; lat: number; heading: number } | null {
  for (let i = 0; i + 1 < stoptimes.length; i++) {
    const a = stoptimes[i], b = stoptimes[i + 1];
    const t0 = a.serviceDay + a.scheduledDeparture, t1 = b.serviceDay + b.scheduledArrival;
    if (now < t0 || now > t1) continue;
    const k = t1 > t0 ? (now - t0) / (t1 - t0) : 0;
    const lon = a.stop.lon + (b.stop.lon - a.stop.lon) * k, lat = a.stop.lat + (b.stop.lat - a.stop.lat) * k;
    const heading = ((Math.atan2((b.stop.lon - a.stop.lon) * Math.cos((lat * Math.PI) / 180), b.stop.lat - a.stop.lat) * 180) / Math.PI + 360) % 360;
    return { lon, lat, heading };
  }
  return null;
}

export function toFerryData(d: Otp, now: number): FerryData {
  const routes: GeoJSON.Feature[] = [];
  const terms = new Map<string, GeoJSON.Feature>();
  const vessels: FerryVessel[] = [];
  for (const r of d.routes) {
    const color = r.color ? `#${r.color}` : "#1D7FB8";
    const live = r.patterns.flatMap((p) => p.vehiclePositions ?? []).filter((v) => !v.lastUpdated || now - v.lastUpdated < 600);
    for (const p of r.patterns) {
      if (p.geometry && p.geometry.length >= 2) routes.push({ type: "Feature", properties: { route: name(r), color }, geometry: { type: "LineString", coordinates: p.geometry.map((g) => [g.lon, g.lat]) } });
      for (const s of p.stops) {
        const key = s.name.toLowerCase();
        if (!terms.has(key)) terms.set(key, { type: "Feature", properties: { name: s.name }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } });
      }
      if (live.length) continue;
      for (const t of p.tripsForDate) {
        const e = t.stoptimes && estimate(t.stoptimes, now);
        if (e) vessels.push({ id: t.gtfsId, route: name(r), ...e, source: "schedule" });
      }
    }
    for (const v of live) vessels.push({ id: v.vehicleId ?? v.label ?? `${r.gtfsId}:${v.lat}`, route: name(r), lon: v.lon, lat: v.lat, heading: v.heading, source: "live" });
  }
  return { routes: { type: "FeatureCollection", features: routes }, terminals: { type: "FeatureCollection", features: [...terms.values()] }, vessels };
}

async function load(): Promise<FerryData> {
  const date = nyDate(new Date());
  const query = `{routes(transportModes:[FERRY]){gtfsId shortName longName color patterns{geometry{lat lon} stops{gtfsId name lat lon} vehiclePositions{vehicleId label lat lon heading lastUpdated} tripsForDate(serviceDate:"${date}"){gtfsId stoptimes{scheduledDeparture scheduledArrival serviceDay stop{lat lon}}}}}}`;
  const res = await fetch(`${OTP_URL}/otp/gtfs/v1`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`OTP returned ${res.status}`);
  return toFerryData(schema.parse(await res.json()).data, Date.now() / 1000);
}

export async function GET(): Promise<Response> {
  try {
    return json(await cached("ferry", 30_000, load), { maxAge: 30, browserMaxAge: 30 });
  } catch (err) {
    return fail(err);
  }
}
