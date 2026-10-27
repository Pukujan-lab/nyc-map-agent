/**
 * Bakes which way each subway stair climbs into public/transit/subway.json
 * (`entrances.features[].properties.up`, a compass bearing), from
 * OpenStreetMap: a `railway=subway_entrance` node and the `highway=steps` way
 * it sits on. The entrance node is the stair's street end, so the way's next
 * node is down; up is the reverse. Street view lays the 3D stair that way and
 * the exit helper says which way you face when you come up it. Entrances with
 * no mapped steps keep no `up` (the app lays them along the curb instead).
 *
 *   pnpm build:entrance-stairs                 # asks Overpass
 *   OSM_JSON=path pnpm build:entrance-stairs   # reuse a saved Overpass response
 *
 * Run after `pnpm build:transit`, which rewrites the entrances.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Pt = [number, number];
type El =
  | { type: "node"; id: number; lat: number; lon: number; tags?: Record<string, string> }
  | { type: "way"; id: number; nodes: number[]; geometry: Array<{ lat: number; lon: number }>; tags?: Record<string, string> };

const FILE = "public/transit/subway.json";
const QUERY = "[out:json][timeout:180];node(40.49,-74.27,40.92,-73.68)[railway=subway_entrance]->.e;.e out;way(bn.e)[highway=steps];out geom;";
/** An MTA entrance and an OSM one farther apart than this are different stairs. */
const MATCH_M = 15;

function metres(a: Pt, b: Pt): number {
  const kx = 111_320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111_320);
}

function bearing(a: Pt, b: Pt): number {
  const kx = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.round(((Math.atan2((b[0] - a[0]) * kx, b[1] - a[1]) * 180) / Math.PI + 360) % 360);
}

async function loadOsm(): Promise<El[]> {
  const cached = process.env.OSM_JSON;
  if (cached && existsSync(cached)) return (JSON.parse(readFileSync(cached, "utf8")) as { elements: El[] }).elements;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "nyc-map-agent build-entrance-stairs" },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}; try again later or pass OSM_JSON`);
  return ((await res.json()) as { elements: El[] }).elements;
}

/** Each OSM entrance on the end of a steps way: its point and the bearing up the stair. */
export function osmStairs(els: El[]): Array<{ at: Pt; up: number }> {
  const nodes = new Map<number, Pt & { level: number }>();
  const ends = new Map<number, Pt>();
  for (const e of els) if (e.type === "node") nodes.set(e.id, Object.assign([e.lon, e.lat] as Pt, { level: Number(e.tags?.level ?? 0) || 0 }));
  const out: Array<{ at: Pt; up: number }> = [];
  for (const w of els) {
    if (w.type !== "way" || w.nodes.length < 2) continue;
    for (const [i, j] of [[0, 1], [w.nodes.length - 1, w.nodes.length - 2]]) {
      const n = nodes.get(w.nodes[i]);
      if (!n || ends.has(w.nodes[i])) continue;
      const next: Pt = [w.geometry[j].lon, w.geometry[j].lat];
      // Mapped below the street (level -1: a mezzanine end), the steps go up from it instead.
      const down = bearing(n, next);
      ends.set(w.nodes[i], n);
      out.push({ at: [n[0], n[1]], up: n.level < 0 ? down : (down + 180) % 360 });
    }
  }
  return out;
}

async function main() {
  const sys = JSON.parse(readFileSync(FILE, "utf8")) as { entrances?: { features: Array<{ geometry: { coordinates: Pt }; properties: Record<string, unknown> }> } };
  const stairs = osmStairs(await loadOsm());
  let matched = 0;
  for (const f of sys.entrances?.features ?? []) {
    delete f.properties.up;
    if (!/stair|escalator/i.test(String(f.properties.kind))) continue;
    let best: { d: number; up: number } | null = null;
    for (const s of stairs) {
      const d = metres(f.geometry.coordinates, s.at);
      if (d <= MATCH_M && (!best || d < best.d)) best = { d, up: s.up };
    }
    if (best) { f.properties.up = best.up; matched++; }
  }
  writeFileSync(FILE, JSON.stringify(sys));
  console.log(`${stairs.length} mapped OSM stairs; ${matched} of ${sys.entrances?.features.length ?? 0} MTA entrances got a direction`);
}

if (process.argv[1]?.endsWith("build-entrance-stairs.ts")) void main();
