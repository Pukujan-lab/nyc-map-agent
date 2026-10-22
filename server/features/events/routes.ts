import { octoQuery } from "../../../api/_lib/octo";
import { fail, json, parseQuery } from "../../../api/_lib/http";
import { nyLocalToIso } from "./normalize";
import { EventGeometry, Query, type EventsResponse } from "./schema";

export { Query };

/**
 * GET /api/events?bbox=&from=&to=&kind= : street fairs, markets, pop-ups,
 * outdoor shows, Parks events and event street closures overlapping the time
 * window (default now → +7 days), from core.events (refreshed nightly).
 */
interface Row {
  id: string;
  title: string;
  kind: string;
  start_at: string;
  end_at: string;
  location: unknown;
  address: string | null;
  source: string;
  url: string | null;
}

const DAY = 86_400_000;
const MAX_WINDOW_DAYS = 31;

export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  const from = q.from ? new Date(q.from) : new Date();
  const to = q.to ? new Date(q.to) : new Date(from.getTime() + 7 * DAY);
  if (!(to > from) || to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY) {
    return json({ error: "invalid_query", issues: [`to: must be after from and within ${MAX_WINDOW_DAYS} days`] }, { status: 400 });
  }
  const [w, s, e, n] = q.bbox ?? [null, null, null, null];
  try {
    const { rows } = await octoQuery<Row>(
      `SELECT id, title, kind, to_char(start_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD"T"HH24:MI:SS') AS start_at,
              to_char(end_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD"T"HH24:MI:SS') AS end_at,
              location, address, source, url
       FROM core.events
       WHERE start_at < $2::timestamptz AND end_at >= $1::timestamptz
         AND ($3::text[] IS NULL OR kind = ANY($3::text[]))
         AND ($4::float8 IS NULL OR (lon BETWEEN $4 AND $6 AND lat BETWEEN $5 AND $7))
       ORDER BY start_at, id`,
      [from.toISOString(), to.toISOString(), q.kind?.length ? q.kind : null, w, s, e, n],
      { rowLimit: 5000 },
    );
    const body: EventsResponse = {
      type: "FeatureCollection",
      features: rows.flatMap((r) => {
        const geometry = EventGeometry.safeParse(typeof r.location === "string" ? JSON.parse(r.location) : r.location);
        if (!geometry.success) return [];
        const { start_at, end_at, id, title, kind, address, source, url } = r;
        const rest = { id, title, kind, address, source, url };
        return [{
          type: "Feature" as const,
          id: r.id,
          geometry: geometry.data,
          properties: { ...rest, start: nyLocalToIso(start_at), end: nyLocalToIso(end_at) } as EventsResponse["features"][number]["properties"],
        }];
      }),
    };
    return json(body, { maxAge: 900, browserMaxAge: 300 });
  } catch (err) {
    return fail(err);
  }
}
