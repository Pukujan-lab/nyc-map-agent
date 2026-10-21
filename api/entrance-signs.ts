import { pmtilesProxy } from "./city-tiles";

/**
 * GET /api/entrance-signs: what each subway street entrance's sign says (station name, the
 * routes of its station complex, exit-only entrances). Built from MTA Subway Entrances and
 * Exits (data.ny.gov i9wp-a4ja) by scripts/build-entrance-signs.ts, published through Octo
 * files to R2 as entrance-signs.json and served same-origin here (~19 KB).
 */
export const GET = pmtilesProxy("entrance-signs.json", "application/json");
