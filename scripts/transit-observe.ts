/**
 * Polls the subway GTFS-rt feeds for a while and logs observed segment travel
 * and dwell times into Octo (raw.transit_segment_obs), then trims rows older
 * than 60 days and refreshes marts.transit_segment_hourly. With MTA_BUSTIME_KEY
 * set it also tracks bus vehicle positions in memory and, at the end of the run,
 * pushes one median per bus segment and hour of week into the bounded reservoir
 * raw.transit_bus_segment_samples (last 15 runs per key; idle keys trimmed at 60 days). Runs on the
 * gravebuster runner (.github/workflows/transit-observe.yml), not on a laptop.
 *
 *   pnpm transit:observe [minutes=13] [intervalSeconds=30]
 */
import { octoQuery } from "../api/_lib/octo";
import { loadBuses, loadTrips } from "../server/features/transit/routes";
import { BusObserver, runMedians, type BusObs } from "../server/features/transit/busObserve";
import { nyHourOfWeek } from "../server/features/transit/segments";
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

const BUS_SAMPLES = 15;

async function writeBus(obs: BusObs[]) {
  const rows = runMedians(obs, (at) => nyHourOfWeek(new Date(at * 1000)));
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const params: unknown[] = [];
    const values = chunk.map((r) => {
      params.push(r.route, r.dir, r.from, r.to, r.kind, r.dow, r.hour, r.median);
      const b = params.length - 8;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},ARRAY[$${b + 8}::real])`;
    });
    await octoQuery(
      `INSERT INTO raw.transit_bus_segment_samples AS t (route, dir, from_stop, to_stop, kind, dow, hour, samples) VALUES ${values.join(",")}
       ON CONFLICT (route, dir, from_stop, to_stop, kind, dow, hour)
       DO UPDATE SET samples = (excluded.samples || t.samples)[1:${BUS_SAMPLES}], updated_at = now()`,
      params,
    );
  }
  await octoQuery(`DELETE FROM raw.transit_bus_segment_samples WHERE updated_at < now() - interval '${RETENTION_DAYS} days'`);
  return rows.length;
}

async function main() {
  loadEnv();
  const minutes = Number(process.argv[2] ?? 13), every = Number(process.argv[3] ?? 30);
  const ext = await octoQuery<{ name: string }>("SELECT name FROM pg_available_extensions WHERE name = 'timescaledb'");
  console.log(`timescaledb available: ${ext.rows.length > 0} (rollup uses a plain materialized view either way)`);
  const obs = new SegmentObserver("subway");
  const busKey = process.env.MTA_BUSTIME_KEY;
  const busObs = new BusObserver();
  const busRows: BusObs[] = [];
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
    if (busKey) {
      try {
        busRows.push(...busObs.ingest((await loadBuses(busKey)).buses));
      } catch (err) {
        console.error(`bus poll failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await new Promise((r) => setTimeout(r, every * 1000));
  }
  await octoQuery(`DELETE FROM raw.transit_segment_obs WHERE observed_at < now() - interval '${RETENTION_DAYS} days'`);
  await octoQuery("REFRESH MATERIALIZED VIEW CONCURRENTLY marts.transit_segment_hourly").catch(() =>
    octoQuery("REFRESH MATERIALIZED VIEW marts.transit_segment_hourly"),
  );
  console.log(`logged ${total} observations`);
  if (busKey) console.log(`bus: ${busRows.length} observations -> ${await writeBus(busRows)} segment samples`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
