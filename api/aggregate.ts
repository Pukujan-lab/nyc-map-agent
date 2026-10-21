import { z } from "zod";
import { octoQuery } from "./_lib/octo";
import { fail, json, parseQuery } from "./_lib/http";

export const Query = z.object({
  dataset: z.enum(["noise", "crashes"]),
  window: z.enum(["90d", "12mo"]).default("12mo"),
});

/**
 * The rollups are 4-8 MB of JSON rebuilt once a night, so this endpoint keeps
 * the serialized body in memory. A request within FRESH_MS is answered from
 * memory; after that one tiny `generated_at` lookup decides whether to refetch
 * the body (as text, never parsed and re-stringified). If Octo is slow or down
 * the last body is served stale rather than making the map wait.
 */
const FRESH_MS = 5 * 60 * 1000;
const CHECK_TIMEOUT_MS = 4000;
interface Entry { body: string; generatedAt: string; checkedAt: number }
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry | null>>();

async function load(dataset: string, windowId: string, prev: Entry | undefined): Promise<Entry | null> {
  if (prev) {
    const { rows } = await octoQuery<{ generated_at: string }>(
      "SELECT generated_at::text AS generated_at FROM marts.aggregates WHERE dataset = $1 AND window_id = $2",
      [dataset, windowId],
      { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) },
    );
    if (rows[0]?.generated_at === prev.generatedAt) return { ...prev, checkedAt: Date.now() };
  }
  const { rows } = await octoQuery<{ result: string; generated_at: string }>(
    "SELECT result::text AS result, generated_at::text AS generated_at FROM marts.aggregates WHERE dataset = $1 AND window_id = $2",
    [dataset, windowId],
  );
  if (!rows[0]) return null;
  const body = typeof rows[0].result === "string" ? rows[0].result : JSON.stringify(rows[0].result);
  return { body, generatedAt: rows[0].generated_at, checkedAt: Date.now() };
}

/** Cached body for one rollup; concurrent misses share one Octo round trip. */
export async function aggregateBody(dataset: string, windowId: string): Promise<Entry | null> {
  const key = `${dataset}:${windowId}`;
  const prev = cache.get(key);
  if (prev && Date.now() - prev.checkedAt < FRESH_MS) return prev;
  let pending = inflight.get(key);
  if (!pending) {
    pending = load(dataset, windowId, prev)
      .then((entry) => {
        if (entry) cache.set(key, entry);
        return entry;
      })
      .catch((err) => {
        if (prev) return prev; // stale beats a spinner
        throw err;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  // A known body never waits on a refresh.
  return prev ? (pending.catch(() => prev), prev) : pending;
}

/**
 * GET /api/aggregate?dataset=noise&window=90d: the precomputed browser rollup
 * (NTA + real-block detail, top types, addresses, intersections) from
 * marts.aggregates, built nightly by scripts/build-aggregates.ts.
 */
export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  try {
    const entry = await aggregateBody(q.dataset, q.window);
    if (!entry) return json({ error: "not_built" }, { status: 404 });
    const etag = `"${q.dataset}-${q.window}-${entry.generatedAt.replace(/\D/g, "")}"`;
    const headers = {
      etag,
      "cache-control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
    };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(entry.body, { headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
  } catch (err) {
    return fail(err);
  }
}
