import { z } from "zod";
import { OctoError } from "./octo";

/** JSON response with CDN caching: marts change nightly, so cache at the edge. */
export function json(body: unknown, init: { status?: number; maxAge?: number; browserMaxAge?: number } = {}): Response {
  const maxAge = init.maxAge ?? 900;
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control":
        init.status && init.status >= 400
          ? "no-store"
          : `public, max-age=${init.browserMaxAge ?? 60}, s-maxage=${maxAge}, stale-while-revalidate=86400`,
    },
  });
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, url: string): z.infer<T> | Response {
  const params = Object.fromEntries(new URL(url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return json({ error: "invalid_query", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  }
  return parsed.data;
}

export function fail(err: unknown): Response {
  const status = err instanceof OctoError && err.status === 400 ? 400 : 502;
  console.error(err);
  return json({ error: status === 400 ? "bad_request" : "upstream_error" }, { status });
}

export const csv = z
  .string()
  .max(2000)
  .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
  .optional();

export const WINDOWS = { "90d": "90 days", "12mo": "12 months" } as const;
export const windowParam = z.enum(["90d", "12mo"]).default("12mo");
export const sourceId = z.string().regex(/^[a-z0-9-]{1,40}$/);
