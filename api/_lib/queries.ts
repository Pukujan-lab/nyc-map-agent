/**
 * SQL builders for the API. Every user value goes in as a bind parameter;
 * only fixed fragments chosen from whitelists are interpolated.
 */
export type Level = "block" | "nta" | "cd" | "borough";
export const LEVELS: Level[] = ["block", "nta", "cd", "borough"];

const AREA_EXPR: Record<Level, string> = {
  block: "b.r::text || ':' || b.c::text",
  nta: "a.nta2020",
  cd: "a.boro_cd::text",
  borough: "a.borough",
};

export interface BlocksFilter {
  source: string;
  window: "90d" | "12mo";
  level: Level;
  categories?: string[];
  severity?: string[];
  borough?: string;
  nta?: string;
}

export function blocksQuery(f: BlocksFilter): { sql: string; params: unknown[] } {
  const params: unknown[] = [f.source, f.window === "90d" ? "90 days" : "12 months"];
  const where = [
    "b.source_id = $1",
    "(b.month IS NULL OR b.month >= date_trunc('month', now() - $2::interval))",
  ];
  if (f.categories?.length) {
    params.push(f.categories);
    where.push(`b.category = ANY($${params.length}::text[])`);
  }
  if (f.severity?.length) {
    params.push(f.severity);
    where.push(`b.severity = ANY($${params.length}::text[])`);
  }
  if (f.borough) {
    params.push(f.borough.toUpperCase());
    where.push(`a.borough = $${params.length}`);
  }
  if (f.nta) {
    params.push(f.nta);
    where.push(`a.nta2020 = $${params.length}`);
  }
  const area = AREA_EXPR[f.level];
  const blockCols = f.level === "block" ? ", min(b.r) AS r, min(b.c) AS c" : "";
  const sql = `
    SELECT area, n, round((percent_rank() OVER (ORDER BY n) * 100)::numeric, 1) AS pct${f.level === "block" ? ", r, c" : ""}
    FROM (
      SELECT ${area} AS area, sum(b.n) AS n${blockCols}
      FROM marts.block_month b
      ${f.level === "block" && !f.borough && !f.nta ? "LEFT" : ""} JOIN core.block_areas a USING (r, c)
      WHERE ${where.join(" AND ")}
      GROUP BY 1
    ) t
    WHERE area IS NOT NULL AND n > 0
    ORDER BY n DESC`;
  return { sql, params };
}
