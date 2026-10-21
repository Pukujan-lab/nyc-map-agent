import { z } from "zod";
import { fail, json } from "../../../api/_lib/http";
import { cached, getJson, NWS_HEADERS } from "../../lib/ttlCache";

/**
 * GET /api/hazards : NWS active alerts that touch NYC (flood, flash flood,
 * coastal flood, heat, wind, winter storm, air quality) with their polygons or
 * forecast-zone shapes, plus FloodNet NYC street flood sensors that read water
 * right now. Cached ~5 min. `?mock=1` returns a fixed sample for QA.
 */
export interface HazardAlert {
  id: string;
  event: string;
  headline: string;
  severity: string;
  ends: string | null;
  geometry: GeoJSON.Geometry | null;
}
export interface FloodSensor {
  id: string;
  name: string;
  lon: number;
  lat: number;
  depthMm: number;
}
export interface Hazards {
  alerts: HazardAlert[];
  sensors: FloodSensor[];
  mock?: boolean;
}

/** NWS forecast zones covering the five boroughs. */
const NYC_ZONES = new Set(["NYZ072", "NYZ073", "NYZ074", "NYZ075", "NYZ076", "NYZ176", "NYZ178"]);
const EVENTS = /flood|heat|wind|winter|blizzard|ice storm|snow|air quality/i;
const FLOODNET = "https://api.floodnet.nyc/api/rest";
const WET_MM = 25;

const Alerts = z.object({
  features: z.array(
    z.object({
      id: z.string(),
      geometry: z.unknown().nullable(),
      properties: z.object({
        event: z.string(),
        headline: z.string().nullable(),
        severity: z.string(),
        ends: z.string().nullable(),
        expires: z.string().nullable(),
        affectedZones: z.array(z.string()),
      }),
    }),
  ),
});
const Zone = z.object({ geometry: z.unknown() });
const Deployments = z.object({
  deployments: z.array(
    z.object({
      deployment_id: z.string(),
      name: z.string(),
      date_down: z.string().nullable(),
      location: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
    }),
  ),
});
const Depth = z.object({ depth_data: z.array(z.object({ depth_proc_mm: z.number().nullable() })) });

const zoneId = (url: string) => url.split("/").pop() ?? "";

async function alerts(): Promise<HazardAlert[]> {
  const raw = Alerts.parse(await getJson("https://api.weather.gov/alerts/active?area=NY", NWS_HEADERS));
  const nyc = raw.features.filter(
    (f) => EVENTS.test(f.properties.event) && f.properties.affectedZones.some((z) => NYC_ZONES.has(zoneId(z))),
  );
  return Promise.all(
    nyc.map(async (f) => {
      let geometry = (f.geometry as GeoJSON.Geometry | null) ?? null;
      if (!geometry) {
        const zones = f.properties.affectedZones.filter((z) => NYC_ZONES.has(zoneId(z)));
        const shapes = await Promise.all(
          zones.map((url) =>
            cached(`zone:${url}`, 24 * 3600_000, async () => Zone.parse(await getJson(url, NWS_HEADERS)).geometry as GeoJSON.Geometry),
          ),
        );
        geometry = { type: "GeometryCollection", geometries: shapes };
      }
      return {
        id: f.id,
        event: f.properties.event,
        headline: f.properties.headline ?? f.properties.event,
        severity: f.properties.severity,
        ends: f.properties.ends ?? f.properties.expires,
        geometry,
      };
    }),
  );
}

async function sensors(): Promise<FloodSensor[]> {
  const list = await cached("floodnet:deployments", 3600_000, async () =>
    Deployments.parse(await getJson(`${FLOODNET}/deployments/flood`)).deployments.filter((d) => !d.date_down),
  );
  const end = new Date();
  const start = new Date(end.getTime() - 20 * 60_000);
  const q = new URLSearchParams({ start_time: start.toISOString(), end_time: end.toISOString() });
  const out: FloodSensor[] = [];
  // ~450 sensors, 16 at a time: one small request each, only every 5 minutes.
  for (let i = 0; i < list.length; i += 16) {
    await Promise.all(
      list.slice(i, i + 16).map(async (d) => {
        try {
          const { depth_data } = Depth.parse(
            await getJson(`${FLOODNET}/deployments/flood/${d.deployment_id}/depth?${q}`, undefined, 4000),
          );
          const last = depth_data.at(-1)?.depth_proc_mm ?? 0;
          if (last >= WET_MM) {
            const [lon, lat] = d.location.coordinates;
            out.push({ id: d.deployment_id, name: d.name, lon, lat, depthMm: last });
          }
        } catch {
          /* one silent sensor never fails the feed */
        }
      }),
    );
  }
  return out;
}

function mock(): Hazards {
  return {
    mock: true,
    alerts: [
      {
        id: "mock-ffw",
        event: "Flash Flood Warning",
        headline: "Flash Flood Warning issued for Brooklyn and Queens (sample data)",
        severity: "Severe",
        ends: new Date(Date.now() + 3 * 3600_000).toISOString(),
        geometry: {
          type: "Polygon",
          coordinates: [[[-74.0, 40.66], [-73.9, 40.66], [-73.88, 40.72], [-73.96, 40.74], [-74.0, 40.66]]],
        },
      },
    ],
    sensors: [
      { id: "mock-1", name: "BK - Atlantic Ave/Nevins St", lon: -73.9817, lat: 40.6858, depthMm: 140 },
      { id: "mock-2", name: "BK - 3rd Ave/Union St", lon: -73.9853, lat: 40.6779, depthMm: 60 },
      { id: "mock-3", name: "M - Delancey St/Clinton St", lon: -73.9866, lat: 40.7182, depthMm: 35 },
    ],
  };
}

export async function GET(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get("mock") === "1") return json(mock(), { maxAge: 60 });
  try {
    const body = await cached<Hazards>("hazards", 5 * 60_000, async () => {
      const [a, s] = await Promise.allSettled([alerts(), sensors()]);
      if (a.status === "rejected" && s.status === "rejected") throw a.reason;
      return { alerts: a.status === "fulfilled" ? a.value : [], sensors: s.status === "fulfilled" ? s.value : [] };
    });
    return json(body, { maxAge: 300, browserMaxAge: 120 });
  } catch (err) {
    return fail(err);
  }
}
