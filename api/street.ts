import { z } from "zod";
import { octoQuery } from "./_lib/octo";
import { fail, json, parseQuery } from "./_lib/http";

const Query = z.object({
  name: z.string().trim().min(2).max(80),
  borough: z.enum(["MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"]).optional(),
});

/** GET /api/street?name=BROADWAY&borough=MANHATTAN — noise/crash stats and green→red levels. */
export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  try {
    const { rows } = await octoQuery(
      `SELECT * FROM marts.street_stats
       WHERE street = upper($1) AND ($2::text IS NULL OR borough = $2)
       ORDER BY noise_12mo DESC LIMIT 10`,
      [q.name, q.borough ?? null],
    );
    return json({ name: q.name.toUpperCase(), rows });
  } catch (err) {
    return fail(err);
  }
}
