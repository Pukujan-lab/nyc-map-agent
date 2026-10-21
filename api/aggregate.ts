import { z } from "zod";
import { octoQuery } from "./_lib/octo";
import { fail, json, parseQuery } from "./_lib/http";

const Query = z.object({
  dataset: z.enum(["noise", "crashes"]),
  window: z.enum(["90d", "12mo"]).default("12mo"),
});

/**
 * GET /api/aggregate?dataset=noise&window=90d: the precomputed browser rollup
 * (NTA + block detail, top types, addresses, intersections) from
 * marts.aggregates, built nightly by scripts/build-aggregates.ts.
 */
export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  try {
    const { rows } = await octoQuery<{ result: unknown }>(
      "SELECT result FROM marts.aggregates WHERE dataset = $1 AND window_id = $2",
      [q.dataset, q.window],
    );
    if (!rows[0]) return json({ error: "not_built" }, { status: 404 });
    const result = typeof rows[0].result === "string" ? JSON.parse(rows[0].result) : rows[0].result;
    return json(result, { maxAge: 3600, browserMaxAge: 600 });
  } catch (err) {
    return fail(err);
  }
}
