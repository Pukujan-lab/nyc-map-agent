/**
 * GET /api/transit-segments?route=G[&dow=1-7&hour=0-23]: historical median and
 * p80 segment travel / station dwell seconds for one subway route at one
 * New York hour of the week, from marts.transit_segment_hourly. dow/hour
 * default to now. The live interpolator blends these with realtime ETAs.
 */
import { z } from "zod";
import { octoQuery } from "../../../api/_lib/octo";
import { fail, json, parseQuery } from "../../../api/_lib/http";

export const Query = z.object({
  route: z.string().regex(/^[A-Za-z0-9]{1,4}$/),
  dow: z.coerce.number().int().min(1).max(7).optional(),
  hour: z.coerce.number().int().min(0).max(23).optional(),
});

export const Segment = z.object({
  dir: z.number().int(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(["travel", "dwell"]),
  n: z.number().int(),
  median: z.number(),
  p80: z.number(),
});
export const Response_ = z.object({ route: z.string(), dow: z.number().int(), hour: z.number().int(), segments: z.array(Segment) });
export type SegmentsResponse = z.infer<typeof Response_>;

/** ISO weekday (1 = Monday) and hour in New York. */
export function nyHourOfWeek(d: Date): { dow: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")!.value;
  return { dow: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd) + 1, hour: Number(parts.find((p) => p.type === "hour")!.value) };
}

export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  const now = nyHourOfWeek(new Date());
  const dow = q.dow ?? now.dow, hour = q.hour ?? now.hour;
  try {
    const { rows } = await octoQuery<{ dir: number; from_stop: string; to_stop: string; kind: "travel" | "dwell"; n: number; median_s: number; p80_s: number }>(
      `SELECT dir, from_stop, to_stop, kind, n, median_s, p80_s FROM marts.transit_segment_hourly
       WHERE system = 'subway' AND route = $1 AND dow = $2 AND hour = $3 AND n >= 3`,
      [q.route, dow, hour],
      { rowLimit: 5000 },
    );
    const body: SegmentsResponse = {
      route: q.route,
      dow,
      hour,
      segments: rows.map((r) => ({ dir: Number(r.dir), from: r.from_stop, to: r.to_stop, kind: r.kind, n: Number(r.n), median: Number(r.median_s), p80: Number(r.p80_s) })),
    };
    return json(body, { maxAge: 900, browserMaxAge: 600 });
  } catch (err) {
    return fail(err);
  }
}
