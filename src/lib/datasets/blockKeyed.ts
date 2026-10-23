/**
 * Registry sources whose counts are keyed by real tax block (block_id = boro *
 * 100000 + block) instead of the ~300 m grid. The ingest joins their points to
 * the block polygons; /api/blocks returns block ids for them at level=block.
 */
export const BLOCK_KEYED_SOURCES: ReadonlySet<string> = new Set(["311"]);

export function isBlockKeyed(sourceId: string): boolean {
  return BLOCK_KEYED_SOURCES.has(sourceId);
}

/** Fine-grid scale the ingest rolls points to before the block join (cells ~11 m). */
export const POINT_CELL_SCALE = 10_000;

/** Centre of a floor(coord * POINT_CELL_SCALE) cell. */
export function cellCenter(index: number): number {
  return (index + 0.5) / POINT_CELL_SCALE;
}

const BORO_NUMBER: Record<string, number> = {
  MANHATTAN: 1,
  BRONX: 2,
  BROOKLYN: 3,
  QUEENS: 4,
  "STATEN ISLAND": 5,
};

/** Borough name to the boro digit of a block id, or undefined. */
export function boroNumber(name: string): number | undefined {
  return BORO_NUMBER[name.toUpperCase()];
}
