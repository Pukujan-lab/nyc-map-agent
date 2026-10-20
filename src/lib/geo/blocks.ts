import type { PolygonRings } from "@/lib/api/nta";

/**
 * Side of one "block" square, in degrees. 0.003° is about 330 m north–south and
 * 250 m east–west in New York, which is roughly a city block group — small
 * enough to see which corner of a neighborhood is loud, coarse enough that a
 * year of 311 data stays a few thousand squares.
 */
export const BLOCK_GRID_DEG = 0.003;

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

/** Closed square ring for one block, ready for deck.gl's PolygonLayer. */
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
