import { z } from "zod";
import { octoQuery } from "./_lib/octo";
import { fail, json, parseQuery } from "./_lib/http";
import { mergeStreetRows, streetVariants, type StreetRow } from "./_lib/streetNames";

export const Query = z.object({
  name: z.string().trim().min(2).max(80),
  borough: z.enum(["MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"]).optional(),
});

/**
 * GET /api/street?name=West 44th Street&borough=MANHATTAN — noise/crash stats
 * and green→red levels, one row per borough, whichever spelling the name uses.
 */
export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  try {
    const { rows } = await octoQuery<StreetRow>(
      `SELECT * FROM marts.street_stats
       WHERE street = ANY($1::text[]) AND ($2::text IS NULL OR borough = $2)
       LIMIT 200`,
      [streetVariants(q.name), q.borough ?? null],
    );
    return json({ name: q.name.toUpperCase(), rows: mergeStreetRows(rows) });
  } catch (err) {
    return fail(err);
  }
}
