import { z } from "zod";
import { octoQuery } from "./_lib/octo";
import { csv, fail, json, parseQuery, sourceId, windowParam } from "./_lib/http";
import { blocksQuery, LEVELS } from "./_lib/queries";

export const Query = z.object({
  source: sourceId,
  window: windowParam,
  level: z.enum(LEVELS as [string, ...string[]]).default("block"),
  categories: csv,
  severity: csv,
  borough: z.enum(["MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"]).optional(),
  nta: z.string().regex(/^[A-Z]{2}\d{2,4}$/).optional(),
});

/**
 * GET /api/blocks?source=noise&window=12mo&level=block|nta|cd|borough
 *   &categories=a,b&severity=injury&borough=BROOKLYN&nta=BK0101
 * One row per area: { area, n, pct } (+ r, c for blocks).
 */
export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  try {
    const { sql, params } = blocksQuery(q as Parameters<typeof blocksQuery>[0]);
    const { rows, truncated } = await octoQuery(sql, params, { rowLimit: 50_000 });
    return json({ ...q, truncated, rows });
  } catch (err) {
    return fail(err);
  }
}
