import { pmtilesProxy } from "./city-tiles";

/**
 * GET /api/block-tiles: real NYC tax-block polygons (nyc-blocks.pmtiles, built
 * by scripts/build-block-tiles.ts), published through Octo files to R2 and
 * served same-origin with Range support exactly like /api/city-tiles.
 */
export const GET = pmtilesProxy("nyc-blocks.pmtiles");
