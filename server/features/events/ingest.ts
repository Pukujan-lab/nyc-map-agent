import { z } from "zod";
import { geosearch, loadIntersections, locateBlock, parkName } from "./centerline";
import { fromParks, fromPermitted, type NormalisedEvent } from "./normalize";
import { ParksEventRow, PermittedEventRow, type EventGeometry } from "./schema";

/**
 * Nightly refresh of core.events (called from scripts/ingest.ts on the
 * self-hosted runner). Fetches both NYC Open Data feeds, normalises, geocodes
 * and upserts; events that ended more than two days ago are pruned.
 */
const SOCRATA = "https://data.cityofnewyork.us/resource";
const PERMITTED_DATASET = "tvpp-9vvx";
const PARKS_DATASET = "w3wp-dpdi";
const DAYS_AHEAD = 30;

type Fetch = (url: string) => Promise<unknown>;
type Query = (sql: string, params?: unknown[]) => Promise<unknown>;

const day = (d: Date) => d.toISOString().slice(0, 10);

interface CollectStats { permitted: number; parks: number; kept: number; noLocation: number }

export async function collectEvents(fetchJson: Fetch, now = new Date()): Promise<{ events: NormalisedEvent[]; stats: CollectStats }> {
  const from = new Date(now.getTime() - 86_400_000);
  const to = new Date(now.getTime() + DAYS_AHEAD * 86_400_000);
  const permitted = z.array(PermittedEventRow).parse(
    await fetchJson(
      `${SOCRATA}/${PERMITTED_DATASET}.json?${new URLSearchParams({
        $where: `end_date_time >= '${day(from)}T00:00:00' AND start_date_time < '${day(to)}T00:00:00' AND event_type not like 'Sport%'`,
        $order: "start_date_time",
        $limit: "50000",
      })}`,
    ),
  );
  const parks = z.array(ParksEventRow).parse(await fetchJson(`${SOCRATA}/${PARKS_DATASET}.json?$limit=50000`));

  const index = await loadIntersections(permitted, fetchJson);
  // Park-name locations are geocoded once each.
  const parkPoints = new Map<string, [number, number] | null>();
  for (const r of permitted) {
    const name = parkName(r.event_location);
    if (!name || parkPoints.has(`${name}|${r.event_borough}`)) continue;
    parkPoints.set(`${name}|${r.event_borough}`, null);
  }
  for (const k of parkPoints.keys()) {
    const [name, borough] = k.split("|");
    parkPoints.set(k, await geosearch(`${name}, ${borough}`, fetchJson).catch(() => null));
  }
  const locate = (r: PermittedEventRow): EventGeometry | null => {
    const block = locateBlock(r, index);
    if (block) return block;
    const name = parkName(r.event_location);
    const at = name ? parkPoints.get(`${name}|${r.event_borough}`) : null;
    return at ? { type: "Point", coordinates: at } : null;
  };

  const byId = new Map<string, NormalisedEvent>();
  let noLocation = 0;
  for (const r of permitted) {
    const e = fromPermitted(r, locate);
    if (e) byId.set(e.id, e);
    else if (fromPermitted(r, () => ({ type: "Point", coordinates: [0, 0] }))) noLocation++;
  }
  for (const r of parks) {
    const e = fromParks(r);
    if (e) byId.set(e.id, e);
  }
  const events = [...byId.values()];
  return { events, stats: { permitted: permitted.length, parks: parks.length, kept: events.length, noLocation } };
}

/** Upserts in batches through one jsonb parameter, then prunes old events. */
export async function upsertEvents(events: NormalisedEvent[], query: Query): Promise<void> {
  for (let i = 0; i < events.length; i += 2000) {
    const batch = events.slice(i, i + 2000).map((e) => ({ ...e, location: JSON.stringify(e.location) }));
    await query(
      `INSERT INTO core.events (id, title, kind, start_at, end_at, location, address, source, url, refreshed_at)
       SELECT id, title, kind, start::timestamptz, "end"::timestamptz, location::jsonb, address, source, url, now()
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, title text, kind text, start text, "end" text, location text, address text, source text, url text)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, kind = EXCLUDED.kind, start_at = EXCLUDED.start_at,
         end_at = EXCLUDED.end_at, location = EXCLUDED.location, address = EXCLUDED.address, source = EXCLUDED.source,
         url = EXCLUDED.url, refreshed_at = EXCLUDED.refreshed_at`,
      [JSON.stringify(batch)],
    );
  }
  await query("DELETE FROM core.events WHERE end_at < now() - interval '2 days'");
}
