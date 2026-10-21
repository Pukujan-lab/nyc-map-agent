/**
 * Bakes MTA static GTFS (subway, LIRR, Metro-North) into compact JSON in
 * public/transit/: line geometry in official route colours, split into
 * underground / at-grade / elevated runs (OSM railway tunnel/bridge tags via
 * Overpass), stations, one measured shape per route for interpolating live
 * trains, and (subway) street entrances from data.ny.gov i9wp-a4ja.
 *
 *   pnpm build:transit            # downloads everything
 *   OSM_JSON=path pnpm build:transit   # reuse a saved Overpass response
 *
 * Needs the `unzip` CLI. Output is committed; rerun when MTA republishes GTFS.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Grade = "underground" | "grade" | "elevated";
type Pt = [number, number];
const SYSTEMS = {
  subway: { zip: "gtfs_subway.zip", rail: /^(subway|light_rail)$/ },
  lirr: { zip: "gtfslirr.zip", rail: /^rail$/ },
  mnr: { zip: "gtfsmnr.zip", rail: /^rail$/ },
} as const;
type SystemId = keyof typeof SYSTEMS;

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  const keys = head.map((h) => h.replace(/^\uFEFF/, "").trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

const R = 6371000;
function dist(a: Pt, b: Pt): number {
  const x = ((b[0] - a[0]) * Math.PI) / 180 * Math.cos(((a[1] + b[1]) * Math.PI) / 360);
  const y = ((b[1] - a[1]) * Math.PI) / 180;
  return Math.sqrt(x * x + y * y) * R;
}
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

async function download(url: string, to: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

type OsmWay = { tags: Record<string, string>; geometry: { lat: number; lon: number }[] };
async function loadOsm(): Promise<OsmWay[]> {
  const cached = process.env.OSM_JSON;
  if (cached && existsSync(cached)) return (JSON.parse(readFileSync(cached, "utf8")) as { elements: OsmWay[] }).elements;
  const query =
    '[out:json][timeout:180];way["railway"~"^(subway|light_rail|rail)$"](40.49,-74.27,41.30,-72.70);out tags geom;';
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "nyc-map-agent build-transit" },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) { console.warn(`Overpass ${res.status}: every segment will be at-grade`); return []; }
  return ((await res.json()) as { elements: OsmWay[] }).elements;
}

function wayGrade(tags: Record<string, string>): Grade {
  if (tags.tunnel && tags.tunnel !== "no") return "underground";
  if ((tags.bridge && tags.bridge !== "no") || Number(tags.layer) >= 1) return "elevated";
  if (Number(tags.layer) <= -1 || tags.location === "underground") return "underground";
  return "grade";
}

/** Grid of OSM rail vertices (and segment midpoints) → grade, ~110 m cells. */
function osmIndex(ways: OsmWay[], rail: RegExp) {
  const grid = new Map<string, { p: Pt; g: Grade }[]>();
  for (const w of ways) {
    if (!rail.test(w.tags.railway ?? "")) continue;
    const g = wayGrade(w.tags);
    const pts = w.geometry.map((n) => [n.lon, n.lat] as Pt);
    const all: Pt[] = [];
    pts.forEach((p, i) => {
      all.push(p);
      const q = pts[i + 1];
      if (q) {
        const n = Math.floor(dist(p, q) / 25);
        for (let k = 1; k <= n; k++) all.push([p[0] + ((q[0] - p[0]) * k) / (n + 1), p[1] + ((q[1] - p[1]) * k) / (n + 1)]);
      }
    });
    for (const p of all) {
      const key = `${Math.floor(p[0] * 1000)},${Math.floor(p[1] * 1000)}`;
      (grid.get(key) ?? grid.set(key, []).get(key)!).push({ p, g });
    }
  }
  return (p: Pt): Grade => {
    let best: Grade = "grade", bd = 45;
    const cx = Math.floor(p[0] * 1000), cy = Math.floor(p[1] * 1000);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const c of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const d = dist(p, c.p);
        if (d < bd) { bd = d; best = c.g; }
      }
    }
    return best;
  };
}

/** Majority filter so a single mismatched vertex does not flip a run. */
function smooth(g: Grade[]): Grade[] {
  return g.map((_, i) => {
    const win = g.slice(Math.max(0, i - 3), i + 4);
    const counts = new Map<Grade, number>();
    for (const w of win) counts.set(w, (counts.get(w) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  });
}

async function build(id: SystemId, osm: OsmWay[], work: string) {
  const sys = SYSTEMS[id];
  const zip = join(work, sys.zip);
  await download(`https://rrgtfsfeeds.s3.amazonaws.com/${sys.zip}`, zip);
  const dir = join(work, id);
  execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
  const read = (f: string) => parseCsv(readFileSync(join(dir, f), "utf8"));
  const routesCsv = read("routes.txt");
  const stops = read("stops.txt");
  const trips = read("trips.txt");
  const shapesCsv = read("shapes.txt");
  const gradeAt = osmIndex(osm, sys.rail);

  const shapePts = new Map<string, Pt[]>();
  for (const s of shapesCsv) {
    (shapePts.get(s.shape_id) ?? shapePts.set(s.shape_id, []).get(s.shape_id)!).push([Number(s.shape_pt_lon), Number(s.shape_pt_lat)]);
  }
  // Shapes arrive ordered by sequence in all three feeds.
  const shapeLen = (pts: Pt[]) => pts.reduce((a, p, i) => (i ? a + dist(pts[i - 1], p) : 0), 0);

  // Stops served per route, and the longest shape per route (one direction).
  const tripRoute = new Map<string, string>();
  const routeShapes = new Map<string, Set<string>>();
  for (const t of trips) {
    tripRoute.set(t.trip_id, t.route_id);
    if (t.shape_id) (routeShapes.get(t.route_id) ?? routeShapes.set(t.route_id, new Set()).get(t.route_id)!).add(t.shape_id);
  }
  const parentOf = new Map(stops.map((s) => [s.stop_id, s.parent_station || s.stop_id]));
  const routeStops = new Map<string, Set<string>>();
  const st = readFileSync(join(dir, "stop_times.txt"), "utf8").split(/\r?\n/);
  const hdr = st[0].replace(/"/g, "").split(",");
  const iTrip = hdr.indexOf("trip_id"), iStop = hdr.indexOf("stop_id");
  for (let i = 1; i < st.length; i++) {
    const c = st[i].replace(/"/g, "").split(",");
    const r = tripRoute.get(c[iTrip]);
    if (!r || !c[iStop]) continue;
    (routeStops.get(r) ?? routeStops.set(r, new Set()).get(r)!).add(parentOf.get(c[iStop]) ?? c[iStop]);
  }

  const stationRows = stops.filter((s) => (id === "subway" ? s.location_type === "1" : !s.parent_station));
  const stationPos = new Map(stationRows.map((s) => [s.stop_id, [Number(s.stop_lon), Number(s.stop_lat)] as Pt]));
  const stationRoutes = new Map<string, string[]>();
  for (const [r, set] of routeStops) for (const s of set) (stationRoutes.get(s) ?? stationRoutes.set(s, []).get(s)!).push(r);

  const routes: Record<string, { name: string; short: string; color: string; text: string }> = {};
  const lineFeatures: GeoJSON.Feature[] = [];
  const shapes: Record<string, { c: Pt[]; m: number[]; g: Grade[] }> = {};
  const stopM: Record<string, Record<string, number>> = {};

  for (const r of routesCsv) {
    const color = `#${(r.route_color || "808183").toUpperCase()}`;
    routes[r.route_id] = { name: r.route_long_name, short: r.route_short_name || r.route_long_name, color, text: `#${r.route_text_color || "FFFFFF"}` };
    const ids = [...(routeShapes.get(r.route_id) ?? [])].filter((s) => shapePts.has(s));
    if (!ids.length) continue;
    // Draw every distinct branch shape (deduped by endpoints); measure along the longest.
    const seen = new Set<string>();
    const sorted = ids.map((s) => ({ s, pts: shapePts.get(s)!, len: shapeLen(shapePts.get(s)!) })).sort((a, b) => b.len - a.len);
    sorted.forEach(({ pts }, idx) => {
      const ends = [pts[0], pts[pts.length - 1]].map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).sort().join("|");
      if (seen.has(ends)) return;
      seen.add(ends);
      const thin: Pt[] = [];
      for (const p of pts) {
        const last = thin[thin.length - 1];
        if (last && dist(last, p) <= 12) continue;
        // Some shapes jump kilometres in one segment (e.g. B/D over the Manhattan
        // Bridge); resample so heights and grades can vary along it.
        const steps = last && id === "subway" ? Math.floor(dist(last, p) / 40) : 0;
        for (let k = 1; k < steps; k++) thin.push([r5(last[0] + ((p[0] - last[0]) * k) / steps), r5(last[1] + ((p[1] - last[1]) * k) / steps)]);
        thin.push([r5(p[0]), r5(p[1])]);
      }
      if (thin.length < 2) return;
      const grades = smooth(thin.map(gradeAt));
      if (idx === 0) {
        const m: number[] = [];
        thin.forEach((p, i) => m.push(i ? Math.round(m[i - 1] + dist(thin[i - 1], p)) : 0));
        shapes[r.route_id] = { c: thin, m, g: grades };
      }
      let start = 0;
      for (let i = 1; i <= thin.length; i++) {
        if (i === thin.length || grades[i] !== grades[start]) {
          const seg = thin.slice(start, Math.min(i + 1, thin.length));
          if (seg.length > 1) lineFeatures.push({ type: "Feature", properties: { route: r.route_id, color, grade: grades[start] }, geometry: { type: "LineString", coordinates: seg } });
          start = i;
        }
      }
    });
    const sh = shapes[r.route_id];
    if (sh) {
      stopM[r.route_id] = {};
      for (const s of routeStops.get(r.route_id) ?? []) {
        const p = stationPos.get(s);
        if (!p) continue;
        let bi = 0, bd = Infinity;
        sh.c.forEach((c, i) => { const d = dist(c, p); if (d < bd) { bd = d; bi = i; } });
        if (bd < 400) stopM[r.route_id][s] = sh.m[bi];
      }
    }
  }

  const stations: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: stationRows
      .filter((s) => stationRoutes.has(s.stop_id))
      .map((s) => ({
        type: "Feature",
        properties: { id: s.stop_id, name: s.stop_name, routes: stationRoutes.get(s.stop_id)!.sort().join(" ") },
        geometry: { type: "Point", coordinates: [r5(Number(s.stop_lon)), r5(Number(s.stop_lat))] },
      })),
  };

  let entrances: GeoJSON.FeatureCollection | undefined;
  if (id === "subway") {
    const res = await fetch("https://data.ny.gov/resource/i9wp-a4ja.json?$limit=5000&$select=gtfs_stop_id,stop_name,entrance_type,entrance_latitude,entrance_longitude");
    const rows = (await res.json()) as Record<string, string>[];
    entrances = {
      type: "FeatureCollection",
      features: rows
        .filter((e) => e.entrance_latitude && e.gtfs_stop_id)
        .map((e) => ({
          type: "Feature",
          properties: { id: e.gtfs_stop_id, name: e.stop_name, kind: e.entrance_type },
          geometry: { type: "Point", coordinates: [r5(Number(e.entrance_longitude)), r5(Number(e.entrance_latitude))] },
        })),
    };
  }

  const out = { system: id, builtAt: new Date().toISOString(), routes, lines: { type: "FeatureCollection", features: lineFeatures }, stations, shapes, stopM, entrances };
  writeFileSync(join("public/transit", `${id}.json`), JSON.stringify(out));
  const counts = lineFeatures.reduce<Record<string, number>>((a, f) => { const g = String((f.properties as { grade: Grade }).grade); a[g] = (a[g] ?? 0) + 1; return a; }, {});
  console.log(`${id}: ${Object.keys(routes).length} routes, ${stations.features.length} stations, segments ${JSON.stringify(counts)}`);
}

const work = mkdtempSync(join(tmpdir(), "gtfs-"));
const osm = await loadOsm();
console.log(`OSM rail ways: ${osm.length}`);
for (const id of Object.keys(SYSTEMS) as SystemId[]) await build(id, osm, work);

