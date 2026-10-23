/**
 * SQL builders for the API. Every user value goes in as a bind parameter;
 * only fixed fragments chosen from whitelists are interpolated.
 */
import { boroNumber, isBlockKeyed } from "../../src/lib/datasets/blockKeyed";

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

/**
 * Block-keyed sources at block level: one row per real tax block
 * ({ area: block id, block_id, n, pct, lat, lon (south-west corner), nta2020, label }),
 * read from raw.source_block_cells joined to core.tax_blocks.
 */
export function blockKeyedQuery(f: BlocksFilter): { sql: string; params: unknown[] } {
  const params: unknown[] = [f.source, f.window === "90d" ? "90 days" : "12 months"];
  const where = [
    "b.source_id = $1",
    "(b.month IS NULL OR b.month >= date_trunc('month', now() - $2::interval))",
  ];
  if (f.borough) {
    // An unknown name matches no block rather than being interpolated.
    params.push(boroNumber(f.borough) ?? 0);
    where.push(`k.boro = $${params.length}`);
  }
  if (f.nta) {
    params.push(f.nta);
    where.push(`k.nta2020 = $${params.length}`);
  }
  const sql = `
    SELECT block_id::text AS area, block_id, n, round((percent_rank() OVER (ORDER BY n) * 100)::numeric, 1) AS pct,
           lat, lon, nta2020, label
    FROM (
      SELECT k.block_id, sum(b.n) AS n, min(k.south) AS lat, min(k.west) AS lon,
             min(k.nta2020) AS nta2020, min(k.label) AS label
      FROM raw.source_block_cells b
      JOIN core.tax_blocks k USING (block_id)
      WHERE ${where.join(" AND ")}
      GROUP BY k.block_id
    ) t
    WHERE n > 0
    ORDER BY n DESC`;
  return { sql, params };
}

export function blocksQuery(f: BlocksFilter): { sql: string; params: unknown[] } {
  if (f.level === "block" && isBlockKeyed(f.source)) return blockKeyedQuery(f);
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
