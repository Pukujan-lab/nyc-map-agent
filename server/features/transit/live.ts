/**
 * GET /api/transit-live?systems=subway,lirr,mnr[&alerts=1]: every live rail
 * system the map shows (and the service alerts) in one response, so a tab makes
 * one request per refresh instead of one per system plus alerts.
 *
 * Each part comes from the same ~15 s in-memory cache as /api/transit/:system,
 * so this adds no MTA calls. The response carries an ETag (304 on a matching
 * If-None-Match) and `s-maxage=30, stale-while-revalidate=30`, so a CDN in
 * front serves most visitors and refreshes in the background.
 */
import { z } from "zod";
import { json, parseQuery } from "../../../api/_lib/http";
import { cached, loadAlerts, loadTrips } from "./routes";

export const LIVE_SYSTEMS = ["subway", "lirr", "mnr"] as const;
type LiveSystemId = (typeof LIVE_SYSTEMS)[number];

export const Query = z.object({
  systems: z
    .string()
    .max(40)
    .regex(/^((subway|lirr|mnr)(,(subway|lirr|mnr))*)?$/, "comma-separated subway, lirr, mnr")
    .optional(),
  alerts: z.enum(["0", "1"]).optional(),
});

export const CACHE_CONTROL = "public, s-maxage=30, stale-while-revalidate=30";

/** Last body per request shape: when every part is the same cached object, reuse its text and ETag. */
const memo = new Map<string, { parts: unknown[]; text: string; etag: string }>();

async function etagOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  const hex = [...new Uint8Array(digest).slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Weak: a CDN that recompresses the body keeps the validator meaningful.
  return `W/"${hex}"`;
}

/** True when If-None-Match names this ETag (weak comparison, list or *). */
export function matches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const bare = (t: string) => t.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((t) => t.trim() === "*" || bare(t) === bare(etag));
}

export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  const systems = [...new Set((q.systems ?? "").split(",").filter(Boolean))].sort() as LiveSystemId[];
  const withAlerts = q.alerts === "1";
  if (!systems.length && !withAlerts) return json({ error: "nothing_requested" }, { status: 400 });

  const jobs: Array<Promise<unknown>> = systems.map((s) => cached(s, () => loadTrips(s)));
  if (withAlerts) jobs.push(cached("alerts", loadAlerts));
  const settled = await Promise.allSettled(jobs);
  if (settled.every((r) => r.status === "rejected")) {
    for (const r of settled) if (r.status === "rejected") console.error(r.reason instanceof Error ? r.reason.message : r.reason);
    return json({ error: "upstream_error" }, { status: 502 });
  }
  const parts = settled.map((r) => (r.status === "fulfilled" ? r.value : null));

  const key = `${systems.join(",")}|${withAlerts ? 1 : 0}`;
  let hit = memo.get(key);
  if (!hit || hit.parts.length !== parts.length || hit.parts.some((p, i) => p !== parts[i])) {
    const body: { at: number; systems: Partial<Record<LiveSystemId, unknown>>; alerts?: unknown; failed?: string[] } = {
      at: Math.round(Date.now() / 1000),
      systems: {},
    };
    const failed: string[] = [];
    systems.forEach((s, i) => (parts[i] ? (body.systems[s] = parts[i]) : failed.push(s)));
    if (withAlerts) {
      if (parts[systems.length]) body.alerts = parts[systems.length];
      else failed.push("alerts");
    }
    if (failed.length) body.failed = failed;
    const text = JSON.stringify(body);
    hit = { parts, text, etag: await etagOf(text) };
    memo.set(key, hit);
  }

  const headers = { etag: hit.etag, "cache-control": CACHE_CONTROL, vary: "accept-encoding" };
  if (matches(request.headers.get("if-none-match"), hit.etag)) return new Response(null, { status: 304, headers });
  return new Response(hit.text, { status: 200, headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
}
