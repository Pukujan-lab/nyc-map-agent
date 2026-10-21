import { z } from "zod";
import { octoQuery } from "./_lib/octo";
import { fail, json, parseQuery } from "./_lib/http";

const Query = z.object({ level: z.enum(["nta", "cd"]).default("nta") });

/**
 * GET /api/areas?level=nta|cd: simplified boundary GeoJSON from Octo
 * core.area_shapes, with the same property names as the Socrata datasets so
 * the browser parser is shared. Boundaries change yearly at most: cache long.
 */
export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  try {
    const { rows } = await octoQuery<{ area: string; name: string; borough: string; geometry: unknown }>(
      "SELECT area, name, borough, geometry FROM core.area_shapes WHERE level = $1 ORDER BY area",
      [q.level],
      { rowLimit: 1000 },
    );
    const features = rows.map((r) => ({
      type: "Feature",
      properties:
        q.level === "nta"
          ? { nta2020: r.area, ntaname: r.name, boroname: r.borough }
          : { boro_cd: r.area },
      geometry: typeof r.geometry === "string" ? JSON.parse(r.geometry) : r.geometry,
    }));
    return json({ type: "FeatureCollection", features }, { maxAge: 7 * 86400, browserMaxAge: 86400 });
  } catch (err) {
    return fail(err);
  }
}
