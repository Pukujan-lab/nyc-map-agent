/**
 * Polls the subway GTFS-rt feeds for a while and logs observed segment travel
 * and dwell times into Octo (raw.transit_segment_obs), then trims rows older
 * than 60 days and refreshes marts.transit_segment_hourly. Runs on the
 * gravebuster runner (.github/workflows/transit-observe.yml), not on a laptop.
 *
 *   pnpm transit:observe [minutes=13] [intervalSeconds=30]
 */
import { octoQuery } from "../api/_lib/octo";
import { loadTrips } from "../server/features/transit/routes";
import { SegmentObserver, type SegmentObs } from "../server/features/transit/observe";
import { loadEnv } from "./env";

const RETENTION_DAYS = 60;

async function write(rows: SegmentObs[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const params: unknown[] = [];
    const values = chunk.map((r) => {
      params.push(new Date(r.observedAt * 1000).toISOString(), r.system, r.route, r.dir, r.from, r.to, r.kind, r.seconds, r.tripId);
      const b = params.length - 9;
      return `(${Array.from({ length: 9 }, (_, k) => `$${b + k + 1}`).join(",")})`;
    });
    await octoQuery(
      `INSERT INTO raw.transit_segment_obs (observed_at, system, route, dir, from_stop, to_stop, kind, seconds, trip_id) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`,
      params,
    );
  }
}

async function main() {
  loadEnv();
  const minutes = Number(process.argv[2] ?? 13), every = Number(process.argv[3] ?? 30);
  const ext = await octoQuery<{ name: string }>("SELECT name FROM pg_available_extensions WHERE name = 'timescaledb'");
  console.log(`timescaledb available: ${ext.rows.length > 0} (rollup uses a plain materialized view either way)`);
  const obs = new SegmentObserver("subway");
  const end = Date.now() + minutes * 60_000;
  let total = 0;
  while (Date.now() < end) {
    try {
      const { at, trips } = await loadTrips("subway");
      const rows = obs.ingest(trips, at);
      if (rows.length) await write(rows);
      total += rows.length;
    } catch (err) {
      console.error(`poll failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((r) => setTimeout(r, every * 1000));
  }
  await octoQuery(`DELETE FROM raw.transit_segment_obs WHERE observed_at < now() - interval '${RETENTION_DAYS} days'`);
  await octoQuery("REFRESH MATERIALIZED VIEW CONCURRENTLY marts.transit_segment_hourly").catch(() =>
    octoQuery("REFRESH MATERIALIZED VIEW marts.transit_segment_hourly"),
  );
  console.log(`logged ${total} observations`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
