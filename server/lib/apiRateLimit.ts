import type { MiddlewareHandler } from "hono";
import { createLimiter } from "../features/agent/fair-use";
import { clientIp } from "./clientIp";

/**
 * Origin-side limit for the whole /api/* surface (#369): requests per minute
 * from one address. Generous enough for a dozen busy map tabs behind one address (live trains poll every
 * few seconds); it is there to stop refresh spam and scripts, not people.
 * Map tiles and vehicle models are left out: one view fetches many ranges.
 * Without a client address (local dev, tests) nothing is limited, because
 * every caller would share one key.
 */
const SKIP = /^\/api\/(v1\/)?(city-tiles|block-tiles|vehicle-models\/)/;

export function apiRateLimit(env: Record<string, string | undefined> = process.env, now: () => number = Date.now): MiddlewareHandler {
  const max = Number(env.API_RATE_PER_MINUTE ?? 1200);
  if (!Number.isFinite(max) || max <= 0) return (_c, next) => next();
  const limiter = createLimiter({ windowMax: 0, windowMs: 0, burstMax: max, burstMs: 60_000 }, now);
  return async (c, next) => {
    if (SKIP.test(c.req.path)) return next();
    const ip = clientIp(c.req.raw.headers);
    if (ip === "unknown") return next();
    const r = limiter.take(`api:${ip}`);
    if (r.ok) return next();
    const wait = Math.max(1, Math.ceil((r.retryAt - now()) / 1000));
    return c.json({ error: "rate_limited", retryAfterSeconds: wait }, 429, { "retry-after": String(wait), "cache-control": "no-store" });
  };
}
