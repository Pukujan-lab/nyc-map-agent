import { octoQuery } from "./_lib/octo";
import { fail, json } from "./_lib/http";

/** GET /api/sources: registry metadata, filter options and freshness, per source. */
export async function GET(): Promise<Response> {
  try {
    const [sources, categories, severities, runs] = await Promise.all([
      octoQuery("SELECT id, label, short_label, category, dataset_id, kind, unit, polarity, windowed, description, guide, filters FROM core.sources ORDER BY id"),
      octoQuery<{ source_id: string; category: string; n: number }>(`
        SELECT source_id, category, n FROM (
          SELECT source_id, category, sum(n) AS n,
                 row_number() OVER (PARTITION BY source_id ORDER BY sum(n) DESC) AS rk
          FROM marts.block_month WHERE category <> '' GROUP BY 1, 2) t
        WHERE rk <= 40 ORDER BY source_id, n DESC`),
      octoQuery<{ source_id: string; severity: string; n: number }>(
        "SELECT source_id, severity, sum(n) AS n FROM marts.block_month WHERE severity <> '' GROUP BY 1, 2 ORDER BY 1, 3 DESC",
      ),
      octoQuery<{ source_id: string; finished_at: string; rows: number }>(
        "SELECT DISTINCT ON (source_id) source_id, finished_at, rows FROM core.ingest_runs WHERE status = 'ok' ORDER BY source_id, finished_at DESC",
      ),
    ]);
    const group = <T extends { source_id: string }>(rows: T[]) =>
      rows.reduce<Record<string, T[]>>((acc, r) => ((acc[r.source_id] ??= []).push(r), acc), {});
    const cats = group(categories.rows);
    const sev = group(severities.rows);
    const run = Object.fromEntries(runs.rows.map((r) => [r.source_id, r]));
    return json({
      levels: ["block", "nta", "cd", "borough"],
      windows: ["90d", "12mo"],
      sources: sources.rows.map((s) => {
        const id = String(s.id);
        return {
          ...s,
          categories: (cats[id] ?? []).map((c) => ({ value: c.category, n: Number(c.n) })),
          severities: (sev[id] ?? []).map((c) => ({ value: c.severity, n: Number(c.n) })),
          lastIngest: run[id]?.finished_at ?? null,
        };
      }),
    });
  } catch (err) {
    return fail(err);
  }
}
