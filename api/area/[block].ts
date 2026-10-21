import { octoQuery } from "../_lib/octo";
import { fail, json } from "../_lib/http";

/** GET /api/area/:block  (block = "row:col" on the 0.003° grid) — every source for one block. */
export async function GET(request: Request): Promise<Response> {
  const raw = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const m = raw.match(/^(-?\d{1,6}):(-?\d{1,6})$/);
  if (!m) return json({ error: "invalid_block", hint: "use row:col, e.g. 13574:-24658" }, { status: 400 });
  const [r, c] = [Number(m[1]), Number(m[2])];
  try {
    const [area, windows, top] = await Promise.all([
      octoQuery("SELECT nta2020, borough, boro_cd FROM core.block_areas WHERE r = $1 AND c = $2", [r, c]),
      octoQuery("SELECT source_id, win, n, pct FROM marts.block_window WHERE r = $1 AND c = $2 ORDER BY source_id, win", [r, c]),
      octoQuery(
        `SELECT source_id, category, sum(n) AS n FROM marts.block_month
         WHERE r = $1 AND c = $2 AND category <> '' AND month >= date_trunc('month', now() - interval '12 months')
         GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15`,
        [r, c],
      ),
    ]);
    return json({ block: `${r}:${c}`, area: area.rows[0] ?? null, windows: windows.rows, topCategories: top.rows });
  } catch (err) {
    return fail(err);
  }
}
