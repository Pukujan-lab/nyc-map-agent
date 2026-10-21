/**
 * 3D bridge decks and piers for the city tiles, from OSM (Geofabrik New York
 * extract, ODbL): highway/railway ways tagged bridge=yes|viaduct, cut into
 * <= 25 m pieces and extruded as thin slabs at deck height so MapLibre's own
 * fill-extrusion draws them (no extra renderer). Big East River / harbour
 * bridges get a real clearance profile (ramping up from the shore ends);
 * overpasses sit at 6 m per OSM `layer`. Piers stand every ~50 m under decks
 * higher than 8 m.
 *
 *   osmium tags-filter new-york-latest.osm.pbf w/bridge=yes,viaduct -o /tmp/br-all.pbf
 *   osmium extract -b <NYC bbox> /tmp/br-all.pbf -o /tmp/nyc-bridges.pbf
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** Deck clearance at mid-span in metres (approximate published navigational clearances). */
export const MAJOR_BRIDGES: Array<[RegExp, number]> = [
  [/verrazz?ano/i, 69], [/george washington/i, 65], [/bayonne/i, 66], [/whitestone/i, 46],
  [/throgs neck/i, 43], [/brooklyn bridge/i, 41], [/manhattan bridge/i, 41], [/williamsburg bridge/i, 41],
  [/queensboro/i, 40], [/(robert f\. kennedy|triborough)/i, 41], [/goethals/i, 41], [/outerbridge/i, 41],
  [/hell gate/i, 41], [/kosciuszko/i, 38], [/marine parkway|gil hodges/i, 17], [/pulaski/i, 12],
];

type Pt = [number, number];
const M_LAT = 111_320;
const mLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const dist = (a: Pt, b: Pt) => Math.hypot((a[0] - b[0]) * mLon(a[1]), (a[1] - b[1]) * M_LAT);

/** Deck width by road or rail class. */
export function deckWidth(p: Record<string, unknown>): number {
  const lanes = Number(p.lanes);
  if (lanes > 0) return Math.min(30, lanes * 3.4 + 2);
  const hw = str(p.highway);
  if (p.railway) return 5;
  if (/motorway|trunk/.test(hw)) return 14;
  if (/primary|secondary/.test(hw)) return 12;
  if (/tertiary|residential|unclassified|service/.test(hw)) return 8;
  return 4; // footway, cycleway, path
}

/** Index into MAJOR_BRIDGES for a named major bridge, else -1. */
export function majorIndex(p: Record<string, unknown>): number {
  const name = `${str(p["bridge:name"])} ${str(p.name)}`;
  return MAJOR_BRIDGES.findIndex(([re]) => re.test(name));
}

/** Mid-span clearance for a named major bridge, else undefined. */
export function majorHeight(p: Record<string, unknown>): number | undefined {
  const i = majorIndex(p);
  return i < 0 ? undefined : MAJOR_BRIDGES[i][1];
}

/** Height along a bridge: ramps from 0 at the far ends to `h` over `ramp` of the span. */
export function profile(dEnd: number, span: number, h: number, ramp = 0.22): number {
  const r = Math.max(30, span * ramp);
  const t = Math.min(1, dEnd / r);
  return h * (t * t * (3 - 2 * t)); // smoothstep
}

function quad(a: Pt, b: Pt, w: number): Pt[] {
  const kx = mLon(a[1]);
  const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * M_LAT;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * (w / 2) / kx, oy = (dx / len) * (w / 2) / M_LAT;
  const r = (q: number) => +q.toFixed(7);
  return [[r(a[0] + ox), r(a[1] + oy)], [r(b[0] + ox), r(b[1] + oy)], [r(b[0] - ox), r(b[1] - oy)], [r(a[0] - ox), r(a[1] - oy)], [r(a[0] + ox), r(a[1] + oy)]];
}

function square(c: Pt, s: number): Pt[] {
  const kx = mLon(c[1]), h = s / 2;
  return [[c[0] - h / kx, c[1] - h / M_LAT], [c[0] + h / kx, c[1] - h / M_LAT], [c[0] + h / kx, c[1] + h / M_LAT], [c[0] - h / kx, c[1] + h / M_LAT], [c[0] - h / kx, c[1] - h / M_LAT]];
}

interface Way { p: Record<string, unknown>; pts: Pt[] }

/** Deck + pier features for the `bridges` tile layer. */
export function bridgeFeatures(ways: Way[]): object[] {
  const out: object[] = [];
  const feat = (kind: string, ring: Pt[], base: number, height: number) => out.push({
    type: "Feature", tippecanoe: { layer: "bridges", minzoom: 14 },
    properties: { kind, base: +base.toFixed(1), height: +height.toFixed(1) },
    geometry: { type: "Polygon", coordinates: [ring] },
  });
  // Major bridges: every way with the same clearance forms one span; its two
  // farthest-apart points are the shore ends.
  const groups = new Map<number, Pt[]>();
  for (const w of ways) {
    const g = majorIndex(w.p);
    if (g >= 0) groups.set(g, [...(groups.get(g) ?? []), ...w.pts]);
  }
  const ends = new Map<number, { a: Pt; b: Pt; span: number }>();
  for (const [h, pts] of groups) {
    let best = { a: pts[0], b: pts[0], span: 0 };
    const step = Math.max(1, Math.floor(pts.length / 400));
    for (let i = 0; i < pts.length; i += step) for (let j = i + 1; j < pts.length; j += step) {
      const d = dist(pts[i], pts[j]);
      if (d > best.span) best = { a: pts[i], b: pts[j], span: d };
    }
    ends.set(h, best);
  }
  for (const w of ways) {
    if (w.pts.length < 2) continue;
    const g = majorIndex(w.p);
    const major = g < 0 ? undefined : MAJOR_BRIDGES[g][1];
    const layer = Math.max(1, Number(w.p.layer) || 1);
    const width = deckWidth(w.p);
    const heightAt = (q: Pt) => {
      if (!major) return 6 * layer;
      const e = ends.get(g)!;
      return Math.max(6, profile(Math.min(dist(q, e.a), dist(q, e.b)), e.span, major));
    };
    let sincePier = 25;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], b = w.pts[i];
      const n = Math.max(1, Math.ceil(dist(a, b) / 25));
      for (let k = 0; k < n; k++) {
        const p0: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        const p1: Pt = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
        const mid: Pt = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        const top = heightAt(mid);
        feat("deck", quad(p0, p1, width), top - 1.2, top);
        feat("rail", quad(p0, p1, width + 0.4), top, top + 1.1);
        sincePier += dist(p0, p1);
        if (top > 8 && sincePier >= 50) {
          sincePier = 0;
          feat("pier", square(mid, Math.min(4, width / 3)), 0, top - 1.2);
        }
      }
    }
  }
  return out;
}

/** Reads bridge ways from the OSM extract; empty (with a warning) when it is missing. */
export function loadBridgeWays(pbf = process.env.OSM_BRIDGES_PBF ?? "/tmp/nyc-bridges.pbf"): Way[] {
  if (!existsSync(pbf)) {
    console.warn(`no OSM bridges at ${pbf}: no 3D bridge decks`);
    return [];
  }
  const seq = "/tmp/nyc-bridges.geojsonseq";
  execFileSync("osmium", ["export", pbf, "-f", "geojsonseq", "-o", seq, "--overwrite", "--geometry-types=linestring"], { stdio: ["ignore", "ignore", "inherit"] });
  const ways: Way[] = [];
  for (const line of readFileSync(seq, "utf8").split("\n")) {
    const t = line.split(String.fromCharCode(30)).join("").trim();
    if (!t) continue;
    const f = JSON.parse(t) as { geometry: { coordinates: Pt[] }; properties: Record<string, unknown> };
    const p = f.properties;
    if (!p.highway && !p.railway) continue;
    if (/^(proposed|construction|abandoned|razed)$/.test(str(p.highway) || str(p.railway))) continue;
    if (p.tunnel) continue;
    ways.push({ p, pts: f.geometry.coordinates });
  }
  return ways;
}
