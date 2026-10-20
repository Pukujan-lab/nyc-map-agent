import type { Bbox, PolygonRings, Ring } from "@/lib/api/nta";

/**
 * Ray-casting point-in-ring test. Points exactly on an edge are not part of the
 * contract — a point that lands on a shared border is assigned to whichever
 * neighbor wins the test, which is fine for counting.
 */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = yi > lat !== yj > lat;
    if (straddles && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Outer ring containment minus holes. */
export function pointInPolygonRings(
  lon: number,
  lat: number,
  rings: PolygonRings,
): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(lon, lat, rings[i])) return false;
  }
  return true;
}

export function bboxContains(bbox: Bbox, lon: number, lat: number): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

export function pointInMultiPolygon(
  lon: number,
  lat: number,
  polygons: PolygonRings[],
  bbox: Bbox,
): boolean {
  if (!bboxContains(bbox, lon, lat)) return false;
  for (const polygon of polygons) {
    if (pointInPolygonRings(lon, lat, polygon)) return true;
  }
  return false;
}
