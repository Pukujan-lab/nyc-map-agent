/**
 * Which basemap tiles an exit pack needs for an offline, zoomable map of the
 * station area: the station and all its exits plus a ~150 m margin. The
 * OpenFreeMap vector source stops at zoom 14 and MapLibre overzooms it, so
 * the z14 tiles (usually 1–4 per station) also draw zooms 15–18. Pure, for tests.
 */
import type { Pt } from "./exits";

export type Bbox = [number, number, number, number]; // west, south, east, north

export function bboxAround(points: Pt[], marginM = 150): Bbox | null {
  if (!points.length) return null;
  const lat = points[0][1];
  const dLat = marginM / 111_320;
  const dLon = marginM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs) - dLon, Math.min(...ys) - dLat, Math.max(...xs) + dLon, Math.max(...ys) + dLat];
}

function tileXY(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [x, y];
}

/** Tiles at zoom z covering the box. */
export function tilesFor(b: Bbox, z: number): Array<[number, number, number]> {
  const [x0, y0] = tileXY(b[0], b[3], z);
  const [x1, y1] = tileXY(b[2], b[1], z);
  const out: Array<[number, number, number]> = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  return out;
}

/** Fill a {z}/{x}/{y} template. */
export function tileUrl(template: string, [z, x, y]: [number, number, number]): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** Tile URLs for a station area, at the source's max zoom (capped to [minZ, maxZ]). */
export function packTileUrls(templates: string[], points: Pt[], sourceMaxZoom: number, minZ = 15, maxZ = 18): string[] {
  const b = bboxAround(points);
  if (!b || !templates.length) return [];
  const zooms = [];
  for (let z = minZ; z <= maxZ; z++) zooms.push(Math.min(z, sourceMaxZoom));
  const urls = new Set<string>();
  for (const z of new Set(zooms)) for (const t of tilesFor(b, z)) urls.add(tileUrl(templates[0], t));
  return [...urls];
}
