import proj4 from "proj4";
import { z } from "zod";
import { fail, json, parseQuery } from "../../../api/_lib/http";
import { cached, getJson } from "../../lib/ttlCache";

/**
 * Parking: where you can park and the street rules — never live occupancy
 * (no open feed has it).
 *  - NYC DCWP Issued Licenses (Open Data w7w3-xahh), category "Garage & Parking Lot", active.
 *  - OpenStreetMap amenity=parking (ODbL) via Overpass: names and capacity where mapped.
 *  - NYC DOT Parking Regulation Locations and Signs (nfid-uabd), in NY State Plane feet (EPSG:2263).
 *  - NYC DOT Parking Meters Locations and Status (693u-uax6).
 * Garages cached 24 h; street rules 1 h per ~100 m cell.
 */
const SODA = "https://data.cityofnewyork.us/resource";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const UA = { "user-agent": "nyc-map-agent (github.com/Pukujan/nyc-map-agent)" };
const STATE_PLANE = "+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666666 +lat_0=40.16666666666666 +lon_0=-74 +x_0=300000.0000000001 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs";

export interface Garage {
  id: string;
  name: string;
  address: string | null;
  capacity: number | null;
  kind: "garage" | "lot";
  lon: number;
  lat: number;
  source: "dcwp" | "osm";
}

const token = (): Record<string, string> | undefined => {
  const t = process.env.VITE_SOCRATA_APP_TOKEN ?? process.env.SOCRATA_APP_TOKEN;
  return t ? { "X-App-Token": t } : undefined;
};
const soda = (id: string, params: Record<string, string>) => `${SODA}/${id}.json?${new URLSearchParams(params)}`;

const Dcwp = z.object({
  license_nbr: z.string(),
  business_name: z.string().optional(),
  dba_trade_name: z.string().optional(),
  address_building: z.string().optional(),
  address_street_name: z.string().optional(),
  address_borough: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});
const Osm = z.object({
  elements: z.array(
    z.object({
      type: z.string(),
      id: z.number(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      center: z.object({ lat: z.number(), lon: z.number() }).optional(),
      tags: z.record(z.string(), z.string()).optional(),
    }),
  ),
});

const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

async function dcwp(): Promise<Garage[]> {
  const rows = z.array(Dcwp).parse(
    await getJson(
      soda("w7w3-xahh", {
        $select: "license_nbr, business_name, dba_trade_name, address_building, address_street_name, address_borough, latitude, longitude",
        $where: "business_category = 'Garage & Parking Lot' AND license_status = 'Active' AND latitude IS NOT NULL",
        $limit: "5000",
      }),
      token(),
      30_000,
    ),
  );
  return rows
    .filter((r) => r.latitude && r.longitude)
    .map((r) => ({
      id: `dcwp:${r.license_nbr}`,
      name: title(r.dba_trade_name || r.business_name || "Parking garage"),
      address: [r.address_building, r.address_street_name && title(r.address_street_name), r.address_borough].filter(Boolean).join(" ") || null,
      capacity: null,
      kind: "garage" as const,
      lon: r.longitude!,
      lat: r.latitude!,
      source: "dcwp" as const,
    }));
}

async function osm(): Promise<Garage[]> {
  const q = `[out:json][timeout:30];nwr["amenity"="parking"]["access"!~"private|no|customers"](40.49,-74.27,40.92,-73.68);out center 6000;`;
  const res = await fetch(OVERPASS, { method: "POST", headers: { ...UA, "content-type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(q)}`, signal: AbortSignal.timeout(40_000) });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  return Osm.parse(await res.json()).elements.flatMap((e) => {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const t = e.tags ?? {};
    if (lat === undefined || lon === undefined) return [];
    const garage = /multi-storey|underground/.test(t.parking ?? "");
    // Unnamed surface lots are mostly private-ish strip-mall lots: keep only useful ones.
    if (!garage && !t.name && !t.capacity) return [];
    const cap = Number(t.capacity);
    return [{
      id: `osm:${e.type}/${e.id}`,
      name: t.name ?? t.operator ?? (garage ? "Parking garage" : "Parking lot"),
      address: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null,
      capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
      kind: garage ? ("garage" as const) : ("lot" as const),
      lon,
      lat,
      source: "osm" as const,
    }];
  });
}

/** How long a request waits for Overpass before answering without the OSM lots. */
export const OSM_WAIT_MS = 6000;

/** DCWP licences first; an OSM feature within 40 m of one only lends its capacity. */
export async function garages(osmWaitMs = OSM_WAIT_MS): Promise<Garage[]> {
  // Each source cached on its own, so a busy Overpass is retried next time. Overpass can take
  // 40 s when the cache is cold (after every deploy), so the answer does not wait for it past
  // osmWaitMs: it keeps loading into the cache and joins the next answer.
  {
    const late = new Promise<Garage[]>((resolve) => { const t = setTimeout(() => resolve([]), osmWaitMs); (t as { unref?: () => void }).unref?.(); });
    const [a, b] = await Promise.allSettled([
      cached("parking:dcwp", 24 * 3600_000, dcwp),
      Promise.race([cached("parking:osm", 24 * 3600_000, osm), late]),
    ]);
    const lic = a.status === "fulfilled" ? a.value : [];
    const map = b.status === "fulfilled" ? b.value : [];
    if (!lic.length && !map.length) throw new Error("no parking sources reachable");
    const near = (g: Garage, h: Garage) => Math.hypot((g.lon - h.lon) * 84_300, (g.lat - h.lat) * 111_320) < 40;
    const out = lic.map((l) => ({ ...l }));
    for (const o of map) {
      const twin = out.find((l) => l.source === "dcwp" && near(l, o));
      if (twin) twin.capacity ??= o.capacity;
      else out.push(o);
    }
    return out;
  }
}

function dist(a: { lon: number; lat: number }, lon: number, lat: number): number {
  return Math.hypot((a.lon - lon) * 111_320 * Math.cos((lat * Math.PI) / 180), (a.lat - lat) * 111_320);
}

/** For the trip agent's driving mode: nearest garages / lots, closest first. */
export async function findParkingNear(lon: number, lat: number, radiusM = 800, limit = 10) {
  const all = await garages();
  return all
    .map((g) => ({ ...g, distanceM: Math.round(dist(g, lon, lat)) }))
    .filter((g) => g.distanceM <= radiusM)
    .sort((x, y) => x.distanceM - y.distanceM)
    .slice(0, limit);
}

const Sign = z.object({ sign_description: z.string(), on_street: z.string().optional() });
const Meter = z.object({ meter_hours: z.string().optional(), on_street: z.string().optional() });

/** "NO PARKING (SANITATION BROOM SYMBOL) MONDAY THURSDAY 9AM-10:30AM <-> (SUPERSEDES SP-413C)" → "No parking (street cleaning) Mon Thu 9AM-10:30AM" */
export function cleanRule(s: string): string {
  return s
    .replace(/\(SUPERSEDES[^)]*\)/g, "")
    .replace(/\(SANITATION BROOM SYMBOL\)/g, "(street cleaning)")
    .replace(/<->|-->|<--/g, "")
    .replace(/\b(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/g, (d) => d[0] + d.slice(1, 3).toLowerCase())
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(NO PARKING|NO STANDING|NO STOPPING)/, (m) => m[0] + m.slice(1).toLowerCase());
}

export async function streetRules(lon: number, lat: number, radiusM = 150) {
  const cell = `${lon.toFixed(3)},${lat.toFixed(3)}`;
  return cached(`parking:rules:${cell}`, 3600_000, async () => {
    const [x, y] = proj4("WGS84", STATE_PLANE, [lon, lat]);
    const r = radiusM * 3.28084;
    const [signs, meters] = await Promise.all([
      getJson(
        soda("nfid-uabd", {
          $select: "sign_description, on_street",
          $where: `record_type = 'Current' AND sign_x_coord::number between ${Math.round(x - r)} and ${Math.round(x + r)} AND sign_y_coord::number between ${Math.round(y - r)} and ${Math.round(y + r)} AND (sign_description like 'NO PARKING%' OR sign_description like 'NO STANDING%' OR sign_description like 'NO STOPPING%' OR sign_description like '%HOUR PARKING%' OR sign_description like '%HR %')`,
          $limit: "500",
        }),
        token(),
        20_000,
      ).then((v) => z.array(Sign).parse(v)),
      getJson(
        soda("693u-uax6", {
          $select: "meter_hours, on_street",
          $where: `status = 'Active' AND within_circle(location, ${lat}, ${lon}, ${radiusM})`,
          $limit: "200",
        }),
        token(),
        20_000,
      )
        .then((v) => z.array(Meter).parse(v))
        .catch(() => []),
    ]);
    const counts = new Map<string, number>();
    for (const s of signs) {
      const rule = cleanRule(s.sign_description);
      if (rule) counts.set(rule, (counts.get(rule) ?? 0) + 1);
    }
    const meterHours = [...new Set(meters.map((m) => m.meter_hours).filter((h): h is string => !!h))].slice(0, 3);
    return {
      rules: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([rule]) => rule),
      meters: meterHours,
      signCount: signs.length,
    };
  });
}

/** GET /api/parking : all garages / lots as GeoJSON (small enough for one request). */
export async function GET(): Promise<Response> {
  try {
    const all = await garages();
    return json(
      {
        type: "FeatureCollection",
        features: all.map(({ lon, lat, ...p }) => ({ type: "Feature", properties: p, geometry: { type: "Point", coordinates: [lon, lat] } })),
      },
      { maxAge: 86400, browserMaxAge: 3600 },
    );
  } catch (err) {
    return fail(err);
  }
}

export const NearQuery = z.object({
  lon: z.coerce.number().min(-74.3).max(-73.6),
  lat: z.coerce.number().min(40.4).max(41),
  radius: z.coerce.number().min(50).max(3000).optional(),
});

/** GET /api/parking/near?lon=&lat=[&radius=800] : findParkingNear for the trip agent. */
export async function GET_NEAR(request: Request): Promise<Response> {
  const q = parseQuery(NearQuery, request.url);
  if (q instanceof Response) return q;
  try {
    return json({ garages: await findParkingNear(q.lon, q.lat, q.radius), occupancy: "unknown (no open live feed)" }, { maxAge: 3600 });
  } catch (err) {
    return fail(err);
  }
}

/** GET /api/parking/rules?lon=&lat= : street parking rules near a point. */
export async function GET_RULES(request: Request): Promise<Response> {
  const q = parseQuery(NearQuery, request.url);
  if (q instanceof Response) return q;
  try {
    return json(await streetRules(q.lon, q.lat, q.radius ?? 150), { maxAge: 3600 });
  } catch (err) {
    return fail(err);
  }
}
