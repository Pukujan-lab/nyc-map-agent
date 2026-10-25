import type { PolygonRings } from "@/lib/api/nta";

/**
 * Side of one "block" square, in degrees. 0.003° is about 330 m north–south and
 * 250 m east–west in New York, which is roughly a city block group — small
 * enough to see which corner of a neighborhood is loud, coarse enough that a
 * year of 311 data stays a few thousand squares.
 */
export const BLOCK_GRID_DEG = 0.003;
/** The ingest's fine grid behind the tax-block counts (#120): ~22 m, inside the join's ~40 m street snap. */
export const FINE_GRID_DEG = 0.0002;

export interface BlockKey {
  /** `${row}:${col}` — stable across datasets, so noise and crashes line up. */
  key: string;
  /** South-west corner of the square. */
  lat: number;
  lon: number;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function blockKey(lat: number, lon: number): BlockKey {
  const row = Math.floor(lat / BLOCK_GRID_DEG);
  const col = Math.floor(lon / BLOCK_GRID_DEG);
  return {
    key: `${row}:${col}`,
    lat: roundTo(row * BLOCK_GRID_DEG, 4),
    lon: roundTo(col * BLOCK_GRID_DEG, 4),
  };
}

/** Closed square ring for one block, ready for a GeoJSON polygon. */
export function blockPolygon(lon: number, lat: number): PolygonRings {
  return [
    [
      [lon, lat],
      [lon + BLOCK_GRID_DEG, lat],
      [lon + BLOCK_GRID_DEG, lat + BLOCK_GRID_DEG],
      [lon, lat + BLOCK_GRID_DEG],
      [lon, lat],
    ],
  ];
}

/** Closed rectangle for [west, south, east, north] bounds (a real block's frame). */
export function bboxPolygon([w, s, e, n]: [number, number, number, number]): PolygonRings {
  return [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
}

/**
 * The block whose polygon holds (lon, lat). Real blocks (Octo tax blocks) are
 * keyed by their own ids, not by `blockKey`'s grid, so a point lookup has to
 * test the shapes. Rings use even-odd, so holes count as outside.
 */
export function blockContaining<T extends { polygon: PolygonRings }>(blocks: Iterable<T>, lon: number, lat: number): T | undefined {
  for (const block of blocks) {
    const outer = block.polygon[0];
    if (!outer?.length) continue;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of outer) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    let inside = false;
    for (const ring of block.polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return block;
  }
  return undefined;
}
