/**
 * Driving context, all sourced; anything without a source is reported as
 * missing instead of invented.
 *   - DOT Traffic Speeds (NYC Open Data i4gi-tjb9), real time
 *   - Street closures for construction (i6b5-j7bu) and permitted events with closures (tvpp-9vvx)
 *   - 511NY events/construction: needs NY511_API_KEY (free, 511ny.org/developers); stubbed without it
 *   - MTA Bridges & Tunnels tolls: static table below
 *   - Crash hotspots along the route: Octo marts.block_month (source 'crashes')
 * Not wired (no open dataset found / no projection dep): speed & red-light camera
 * locations, the DOT weekly traffic advisory (PDF), parking difficulty.
 */
import { z } from "zod";
import { octoQuery } from "../../../../api/_lib/octo";
import type { LngLatTuple } from "../../../../src/features/agent/schema";
import { distM } from "../transit";

export type Note = { kind: "slow" | "closure" | "advisory" | "event" | "toll" | "camera" | "crashes" | "parking"; text: string; at?: LngLatTuple };

const SODA = "https://data.cityofnewyork.us/resource";
async function soda<T>(id: string, q: Record<string, string>, schema: z.ZodType<T>): Promise<T[]> {
  const res = await fetch(`${SODA}/${id}.json?${new URLSearchParams(q)}`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${id} ${res.status}`);
  return z.array(schema).parse(await res.json());
}

function bbox(coords: LngLatTuple[], padDeg = 0.003) {
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return { w: Math.min(...lons) - padDeg, e: Math.max(...lons) + padDeg, s: Math.min(...lats) - padDeg, n: Math.max(...lats) + padDeg };
}
/** Downsampled route vertices, for cheap "near the route" tests. */
function samples(coords: LngLatTuple[], n = 120): LngLatTuple[] {
  const step = Math.max(1, Math.floor(coords.length / n));
  return coords.filter((_, i) => i % step === 0).concat([coords[coords.length - 1]]);
}
const nearRoute = (pts: LngLatTuple[], p: LngLatTuple, m: number) => pts.some((q) => distM(q, p) < m);

export async function slowSegments(route: LngLatTuple[]): Promise<Note[]> {
  const rows = await soda("i4gi-tjb9", { $limit: "2000", $order: "data_as_of DESC", $where: "data_as_of > '" + new Date(Date.now() - 3600_000 * 6).toISOString().slice(0, 19) + "'" },
    z.object({ link_id: z.string(), speed: z.string(), link_points: z.string(), link_name: z.string(), data_as_of: z.string() }));
  const pts = samples(route);
  const seen = new Set<string>();
  const out: Note[] = [];
  for (const r of rows) {
    if (seen.has(r.link_id)) continue;
    seen.add(r.link_id);
    const speed = Number(r.speed);
    if (!(speed > 0 && speed < 15)) continue;
    const linkPts = r.link_points.split(" ").map((p) => p.split(",").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite)).map(([la, lo]) => [lo, la] as LngLatTuple);
    const hits = linkPts.filter((p) => nearRoute(pts, p, 60)).length;
    if (hits >= Math.max(2, linkPts.length / 3)) out.push({ kind: "slow", text: `${r.link_name.toLowerCase()} moving ${Math.round(speed)} mph (DOT sensors, ${r.data_as_of.slice(11, 16)})`, at: linkPts[0] });
  }
  return out.slice(0, 5);
}

export async function closures(route: LngLatTuple[], dayIso: string): Promise<Note[]> {
  const b = bbox(route);
  const day = dayIso.slice(0, 10);
  const rows = await soda("i6b5-j7bu", { $limit: "500", $where: `work_start_date <= '${day}T23:59:59' AND work_end_date >= '${day}T00:00:00' AND within_box(the_geom, ${b.n}, ${b.w}, ${b.s}, ${b.e})` },
    z.object({ onstreetname: z.string(), fromstreetname: z.string().optional(), tostreetname: z.string().optional(), purpose: z.string().optional(), the_geom: z.object({ coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))) }) }));
  const pts = samples(route);
  return rows
    .filter((r) => r.the_geom.coordinates.flat().some((p) => nearRoute(pts, p, 25)))
    .slice(0, 5)
    .map((r) => ({ kind: "closure" as const, text: `Closure on ${r.onstreetname.toLowerCase()} ${r.fromstreetname ? `from ${r.fromstreetname.toLowerCase()} to ${r.tostreetname?.toLowerCase() ?? ""}` : ""} (${(r.purpose ?? "construction").toLowerCase()})`.replace(/\s+/g, " "), at: r.the_geom.coordinates[0][0] }));
}

/** Event street closures on the day, only where the event location names a street the route uses. */
export async function eventClosures(dayIso: string, streets: string[]): Promise<Note[]> {
  const day = dayIso.slice(0, 10);
  const rows = await soda("tvpp-9vvx", { $limit: "200", $where: `start_date_time <= '${day}T23:59:59' AND end_date_time >= '${day}T00:00:00' AND street_closure_type != 'N/A'` },
    z.object({ event_name: z.string(), event_borough: z.string().optional(), event_location: z.string().optional(), street_closure_type: z.string().optional() }));
  const norm = (x: string) => x.toLowerCase().replace(/\b(street|st|avenue|ave|av|road|rd|boulevard|blvd)\b/g, "").replace(/(\d+)(st|nd|rd|th)\b/g, "$1").replace(/\b(east|e|west|w|north|n|south|s)\b/g, "").replace(/[^a-z0-9]/g, "");
  const keys = [...new Set(streets.map(norm).filter((k) => k.length >= 3))];
  if (!keys.length) return [];
  return rows.filter((r) => { const on = norm((r.event_location ?? "").split(/ between | from /i)[0].replace(/^.*: /, "")); return keys.includes(on); }).slice(0, 3)
    .map((r) => ({ kind: "event" as const, text: `${r.event_name} — ${r.street_closure_type} at ${r.event_location ?? "see NYC events"}` }));
}

/** 511NY needs a free developer key; without it we say so rather than guess. */
export async function ny511(route: LngLatTuple[]): Promise<{ notes: Note[]; stub?: string }> {
  const key = process.env.NY511_API_KEY;
  if (!key) return { notes: [], stub: "511NY events/construction: set NY511_API_KEY (free key from 511ny.org/developers)." };
  const res = await fetch(`https://511ny.org/api/getevents?format=json&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return { notes: [], stub: `511NY returned ${res.status}.` };
  const rows = z.array(z.object({ Description: z.string().optional(), Latitude: z.number(), Longitude: z.number(), EventType: z.string().optional() })).parse(await res.json());
  const pts = samples(route);
  return { notes: rows.filter((r) => nearRoute(pts, [r.Longitude, r.Latitude], 150)).slice(0, 5).map((r) => ({ kind: "advisory" as const, text: `${r.EventType ?? "Event"}: ${r.Description ?? ""}`.slice(0, 200), at: [r.Longitude, r.Latitude] as LngLatTuple })) };
}

/**
 * MTA Bridges & Tunnels crossings, static table. Car rates from mta.info/fares-tolls/tolls/vehicle-types,
 * effective 2026-01-04 (NYCSC E-ZPass / Tolls by Mail). Congestion Relief Zone charge not included. Re-check on each MTA toll change.
 */
export const MTA_TOLLS: Array<{ name: string; at: LngLatTuple; ezpass: number; mail: number }> = [
  { name: "Robert F. Kennedy Bridge", at: [-73.9265, 40.7804], ezpass: 7.46, mail: 12.03 },
  { name: "Verrazzano-Narrows Bridge (Staten Island-bound)", at: [-74.0453, 40.6066], ezpass: 7.46, mail: 12.03 },
  { name: "Throgs Neck Bridge", at: [-73.7942, 40.8007], ezpass: 7.46, mail: 12.03 },
  { name: "Bronx-Whitestone Bridge", at: [-73.8295, 40.8013], ezpass: 7.46, mail: 12.03 },
  { name: "Queens-Midtown Tunnel", at: [-73.9637, 40.7445], ezpass: 7.46, mail: 12.03 },
  { name: "Hugh L. Carey Tunnel", at: [-74.0133, 40.6965], ezpass: 7.46, mail: 12.03 },
  { name: "Henry Hudson Bridge", at: [-73.9213, 40.8777], ezpass: 3.42, mail: 8.87 },
  { name: "Marine Parkway-Gil Hodges Bridge", at: [-73.8833, 40.5736], ezpass: 2.80, mail: 6.02 },
  { name: "Cross Bay Veterans Memorial Bridge", at: [-73.8248, 40.6150], ezpass: 2.80, mail: 6.02 },
];
export function tolls(route: LngLatTuple[]): Note[] {
  const pts = samples(route, 400);
  return MTA_TOLLS.filter((t) => nearRoute(pts, t.at, 250)).map((t) => ({ kind: "toll" as const, text: `${t.name}: $${t.ezpass.toFixed(2)} E-ZPass, $${t.mail.toFixed(2)} by mail (MTA B&T table, verify at mta.info)`, at: t.at }));
}

export async function crashHotspots(route: LngLatTuple[]): Promise<Note[]> {
  if (!process.env.OCTO_API_KEY) return [];
  // The route starts at the person's shared location; leave its first 600 m out
  // of the Octo query so no cell near their position ever reaches Octo.
  const start = route[0];
  const far = (p: LngLatTuple) => !start || Math.hypot((p[0] - start[0]) * 84_300, (p[1] - start[1]) * 111_000) > 600;
  const cells = [...new Set(samples(route, 300).filter(far).map(([lo, la]) => `${Math.floor(la / 0.003)}:${Math.floor(lo / 0.003)}`))];
  const r = cells.map((k) => Number(k.split(":")[0]));
  const c = cells.map((k) => Number(k.split(":")[1]));
  const { rows } = await octoQuery<{ r: number; c: number; n: number }>(
    `SELECT b.r, b.c, sum(b.n)::int AS n FROM marts.block_month b
       JOIN unnest($1::int[], $2::int[]) AS q(r, c) ON q.r = b.r AND q.c = b.c
     WHERE b.source_id = 'crashes' AND (b.month IS NULL OR b.month >= date_trunc('month', now() - interval '12 months'))
     GROUP BY 1, 2 ORDER BY n DESC LIMIT 3`,
    [r, c],
    { rowLimit: 3 },
  );
  return rows.filter((x) => x.n >= 20).map((x) => ({ kind: "crashes" as const, text: `Crash hotspot: ${x.n} crashes in 12 months on a ~300 m stretch of the route`, at: [(x.c + 0.5) * 0.003, (x.r + 0.5) * 0.003] as LngLatTuple }));
}

export const NOT_WIRED = [
  "Speed and red-light camera locations: no NYC Open Data location dataset found.",
  "DOT weekly traffic advisory: published as a web page/PDF, no feed.",
  "Parking difficulty: not wired (parking-sign data uses State Plane coordinates).",
];
