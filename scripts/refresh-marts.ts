/** Refreshes the materialized views in dependency order and prints timings. */
import { octoQuery } from "../api/_lib/octo";
import { loadEnv } from "./env";

export const MART_ORDER = [
  "core.block_areas",
  "marts.block_month",
  "marts.nta_month",
  "marts.block_window",
  "marts.street_stats",
];

async function main() {
  loadEnv();
  for (const view of MART_ORDER) {
    const t0 = Date.now();
    const { rows } = await octoQuery<{ populated: boolean }>(
      "SELECT ispopulated AS populated FROM pg_matviews WHERE schemaname || '.' || matviewname = $1",
      [view],
    );
    // CONCURRENTLY keeps the API readable but needs an already-populated view.
    const mode = rows[0]?.populated ? "CONCURRENTLY " : "";
    try {
      await octoQuery(`REFRESH MATERIALIZED VIEW ${mode}${view}`);
    } catch (err) {
      // Views whose unique index uses an expression cannot refresh concurrently.
      if (!mode || !String(err).includes("concurrently")) throw err;
      await octoQuery(`REFRESH MATERIALIZED VIEW ${view}`);
    }
    const count = await octoQuery<{ n: string }>(`SELECT count(*) AS n FROM ${view}`);
    console.log(`${view}: ${count.rows[0].n} rows (${Date.now() - t0} ms)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
