import { z } from "zod";
import { fail, json, parseQuery } from "../../../api/_lib/http";
import { cached, getJson } from "../../lib/ttlCache";

/**
 * Live traffic: NYC DOT Real-Time Traffic Speed Data (Socrata i4gi-tjb9).
 * Covers only DOT's sensor corridors (highways, FDR, bridges, some major
 * avenues), not every street. Each link's latest speed is compared with its
 * own free-flow speed (the 85th-percentile speed it reported over the last
 * 12 hours) and bucketed green / yellow / red. Street closures come from DOT
 * "Street Closures due to Construction Activities by Block" (i6b5-j7bu).
 * Polled at most every ~5 min (closures hourly) through the in-process cache.
 */
const SODA = "https://data.cityofnewyork.us/resource";
const SPEEDS = "i4gi-tjb9";
const CLOSURES = "i6b5-j7bu";

function soda(id: string, params: Record<string, string>): string {
  return `${SODA}/${id}.json?${new URLSearchParams(params)}`;
}
const token = (): Record<string, string> | undefined => {
  const t = process.env.VITE_SOCRATA_APP_TOKEN ?? process.env.SOCRATA_APP_TOKEN;
  return t ? { "X-App-Token": t } : undefined;
};

const Row = z.object({
  link_id: z.string(),
  link_name: z.string().optional(),
  speed: z.coerce.number(),
  status: z.string().optional(),
  data_as_of: z.string(),
  link_points: z.string().optional(),
});
const Closure = z.object({
  the_geom: z.unknown(),
  onstreetname: z.string().optional(),
  fromstreetname: z.string().optional(),
  tostreetname: z.string().optional(),
  purpose: z.string().optional(),
  work_end_date: z.string().optional(),
});

export type Level = "free" | "slow" | "jam" | "unknown";
export interface TrafficLink {
  id: string;
  name: string;
  speed: number;
  free: number | null;
  ratio: number | null;
  level: Level;
  asOf: string;
  coords: Array<[number, number]>;
}

export function levelFor(ratio: number | null): Level {
  if (ratio === null) return "unknown";
  return ratio >= 0.75 ? "free" : ratio >= 0.45 ? "slow" : "jam";
}

/** "lat,lon lat,lon ..." → [[lon, lat], ...]; the feed truncates some, so drop bad pairs. */
export function parsePoints(s: string | undefined): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const pair of (s ?? "").trim().split(/\s+/)) {
    const [lat, lon] = pair.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat > 40 && lat < 41.5 && lon < -73 && lon > -75) out.push([lon, lat]);
  }
  return out;
}

async function freeFlow(latest: string): Promise<Map<string, number>> {
  return cached("traffic:free", 6 * 3600_000, async () => {
    // A 7-day server-side aggregate times out on this table, so pull the last
    // 12 h of (link, speed) rows and take each link's 85th percentile here.
    const since = new Date(new Date(`${latest}Z`).getTime() - 12 * 3600_000).toISOString().slice(0, 19);
    const rows = z.array(z.object({ link_id: z.string(), speed: z.coerce.number() })).parse(
      await getJson(
        soda(SPEEDS, { $select: "link_id, speed", $where: `data_as_of > '${since}' AND status = '0'`, $limit: "50000" }),
        token(),
        30_000,
      ),
    );
    const by = new Map<string, number[]>();
    for (const r of rows) if (r.speed > 0 && r.speed < 70) (by.get(r.link_id) ?? by.set(r.link_id, []).get(r.link_id)!).push(r.speed);
    const out = new Map<string, number>();
    for (const [id, v] of by) {
      v.sort((x, y) => x - y);
      out.set(id, Math.min(55, v[Math.floor(v.length * 0.85)]));
    }
    return out;
  });
}

export async function trafficLinks(): Promise<TrafficLink[]> {
  return cached("traffic:links", 5 * 60_000, async () => {
    const [latest] = z
      .array(z.object({ max: z.string() }))
      .parse(await getJson(soda(SPEEDS, { $select: "max(data_as_of) as max" }), token()));
    const from = new Date(new Date(`${latest.max}Z`).getTime() - 20 * 60_000).toISOString().slice(0, 19);
    const rows = z.array(Row).parse(
      await getJson(
        soda(SPEEDS, {
          $select: "link_id, link_name, speed, status, data_as_of, link_points",
          $where: `data_as_of >= '${from}'`,
          $order: "data_as_of DESC",
          $limit: "5000",
        }),
        token(),
      ),
    );
    const free = await freeFlow(latest.max).catch(() => new Map<string, number>());
    const seen = new Map<string, TrafficLink>();
    for (const r of rows) {
      if (seen.has(r.link_id)) continue; // newest first
      const coords = parsePoints(r.link_points);
      if (coords.length < 2) continue;
      const ok = r.speed > 0 && r.status !== "-101";
      const f = free.get(r.link_id) ?? null;
      const ratio = ok && f ? Math.min(1.2, r.speed / f) : null;
      seen.set(r.link_id, {
        id: r.link_id,
        name: r.link_name ?? "",
        speed: r.speed,
        free: f,
        ratio,
        level: levelFor(ratio),
        asOf: r.data_as_of,
        coords,
      });
    }
    return [...seen.values()];
  });
}

async function closures(): Promise<GeoJSON.Feature[]> {
  return cached("traffic:closures", 3600_000, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = z.array(Closure).parse(
      await getJson(
        soda(CLOSURES, {
          $where: `work_start_date <= '${today}T23:59:59' AND work_end_date >= '${today}T00:00:00'`,
          $limit: "5000",
        }),
        token(),
      ),
    );
    return rows
      .filter((r) => r.the_geom)
      .map((r) => ({
        type: "Feature" as const,
        properties: {
          kind: "closure",
          name: `${r.onstreetname ?? ""} (${r.fromstreetname ?? ""} – ${r.tostreetname ?? ""})`,
          purpose: r.purpose ?? "",
          until: r.work_end_date?.slice(0, 10) ?? "",
        },
        geometry: r.the_geom as GeoJSON.Geometry,
      }));
  });
}

/** GET /api/traffic : speed links + today's closures as one FeatureCollection. */
export async function GET(): Promise<Response> {
  try {
    const [links, closed] = await Promise.all([trafficLinks(), closures().catch(() => [])]);
    const features: GeoJSON.Feature[] = links.map((l) => ({
      type: "Feature",
      properties: { kind: "link", id: l.id, name: l.name, speed: l.speed, level: l.level, asOf: l.asOf },
      geometry: { type: "LineString", coordinates: l.coords },
    }));
    return json({ type: "FeatureCollection", features: [...features, ...closed] }, { maxAge: 300, browserMaxAge: 120 });
  } catch (err) {
    return fail(err);
  }
}

/** Distance in metres from a point to a segment (equirectangular, fine at city scale). */
function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111_320;
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * 111_320;
  const bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * 111_320;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export interface TrafficAlong {
  links: Array<Pick<TrafficLink, "id" | "name" | "speed" | "free" | "level" | "asOf">>;
  /** Mean speed/free-flow over the matched links, null if none have data. */
  ratio: number | null;
  level: Level;
  coverage: "dot-sensor-corridors-only";
}

/**
 * Traffic along a route (for the trip agent, via GET /api/traffic/along).
 * A link matches when most of its points lie within `bufferM` of the route.
 */
export async function getTrafficAlong(line: Array<[number, number]>, bufferM = 60): Promise<TrafficAlong> {
  const links = await trafficLinks();
  const near = (p: [number, number]) => line.some((a, i) => i > 0 && segDist(p, line[i - 1], a) <= bufferM);
  const hits = links.filter((l) => l.coords.filter(near).length >= Math.ceil(l.coords.length * 0.6));
  const rated = hits.filter((l) => l.ratio !== null);
  const ratio = rated.length ? rated.reduce((s, l) => s + l.ratio!, 0) / rated.length : null;
  return {
    links: hits.map(({ id, name, speed, free, level, asOf }) => ({ id, name, speed, free, level, asOf })),
    ratio,
    level: levelFor(ratio),
    coverage: "dot-sensor-corridors-only",
  };
}

export const AlongQuery = z.object({
  /** "lon,lat;lon,lat;..." (at least two points, at most 500). */
  line: z.string().max(20_000),
  buffer: z.coerce.number().min(10).max(300).optional(),
});

/** GET /api/traffic/along?line=lon,lat;lon,lat[&buffer=60] */
export async function GET_ALONG(request: Request): Promise<Response> {
  const q = parseQuery(AlongQuery, request.url);
  if (q instanceof Response) return q;
  const line = q.line
    .split(";")
    .map((p) => p.split(",").map(Number) as [number, number])
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  if (line.length < 2 || line.length > 500) return json({ error: "line needs 2-500 lon,lat points" }, { status: 400 });
  try {
    return json(await getTrafficAlong(line, q.buffer), { maxAge: 120, browserMaxAge: 60 });
  } catch (err) {
    return fail(err);
  }
}
