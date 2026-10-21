/**
 * pnpm feeds:health — ping every upstream in scripts/feeds.ts.
 *
 * Proxy feeds go through our Hono app: in-process by default (needs OCTO_* in
 * the env or OCTO_ENV_FILE; values are never printed), or against a running
 * instance with FEED_HEALTH_BASE_URL. Exit 1 if any non-optional feed fails;
 * writes a Markdown table to $GITHUB_STEP_SUMMARY when set.
 */
import { appendFileSync } from "node:fs";
import { loadEnv } from "./env";
import { FEEDS, type Feed } from "./feeds";

loadEnv();
const BASE = process.env.FEED_HEALTH_BASE_URL?.replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.FEED_HEALTH_TIMEOUT_MS ?? 15000);

type Status = "ok" | "fail" | "skipped";
interface Result { id: string; via: string; status: Status; code: number | null; ms: number; note: string }

async function request(feed: Feed): Promise<Response> {
  const init = { ...feed.init, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (feed.via === "direct") return fetch(feed.url, init);
  if (BASE) return fetch(BASE + feed.url, init);
  const { app } = await import("../server/app");
  return app.fetch(new Request("http://local" + feed.url, init));
}

async function probe(feed: Feed): Promise<Result> {
  const t0 = Date.now();
  try {
    const res = await request(feed);
    const body = await res.text();
    const ms = Date.now() - t0;
    if (res.status === 404 && feed.optional) return { id: feed.id, via: feed.via, status: "skipped", code: 404, ms, note: "route not built yet" };
    const ok = res.ok && (feed.expect ? feed.expect(body) : true);
    return { id: feed.id, via: feed.via, status: ok ? "ok" : "fail", code: res.status, ms, note: ok ? (ms > TIMEOUT_MS ? `slow (> ${TIMEOUT_MS} ms)` : "") : body.slice(0, 120).replace(/\s+/g, " ") };
  } catch (err) {
    return { id: feed.id, via: feed.via, status: "fail", code: null, ms: Date.now() - t0, note: String(err instanceof Error ? err.message : err) };
  }
}

const results = await Promise.all(FEEDS.map(probe));
const failed = results.filter((r) => r.status === "fail" && !FEEDS.find((f) => f.id === r.id)?.optional);
const lines = [
  "| feed | via | status | http | ms | note |",
  "| --- | --- | --- | --- | --- | --- |",
  ...results.map((r) => `| ${r.id} | ${r.via} | ${r.status === "ok" ? "✅ ok" : r.status === "skipped" ? "⏭ skipped" : "❌ fail"} | ${r.code ?? "-"} | ${r.ms} | ${r.note.replace(/\|/g, "/")} |`),
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Feed health\n\n${lines.join("\n")}\n`);
console.log(failed.length ? `\n${failed.length} feed(s) failing: ${failed.map((f) => f.id).join(", ")}` : "\nall feeds healthy");
process.exit(failed.length ? 1 : 0);
