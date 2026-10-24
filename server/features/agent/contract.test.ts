import { afterEach, describe, expect, it, vi } from "vitest";
import { askAgent, friendlyError } from "../../../src/features/agent/stream";
import type { StreamEvent } from "../../../src/features/agent/schema";
import { app } from "../../app";

// Client (askAgent) → mounted Hono app: the exact body the UI sends must pass the route and reach the handler.
afterEach(() => vi.unstubAllGlobals());

async function collect(): Promise<{ events: StreamEvent[]; calls: string[] }> {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push(url);
    return app.request(url, init);
  });
  const events: StreamEvent[] = [];
  const req = { messages: [{ role: "user" as const, content: "how to get to times square" }], location: null, mode: "transit" as const, now: new Date().toISOString() };
  for await (const ev of askAgent(req)) events.push(ev);
  return { events, calls };
}

describe("agent client/server contract", () => {
  it("the client's request is accepted by the mounted route (not a 400)", async () => {
    const { events, calls } = await collect();
    expect(calls[0]).toMatch(/\/api\/(v1\/)?agent$/);
    // No LLM key in tests: the handler streams its own error event, which proves the body got past validation.
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "error" && /returned \d+|understand that request/.test(e.message))).toBe(false);
  });

  it("both /api/agent and /api/v1/agent accept a valid body", async () => {
    for (const p of ["/api/agent", "/api/v1/agent"]) {
      const res = await app.request(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) });
      expect(res.status, p).toBe(200);
      await res.body?.cancel();
    }
  });

  it("a bad body is still a 400", async () => {
    const res = await app.request("/api/v1/agent", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(400);
  });

  it("failed requests show plain words, not a status code", () => {
    for (const s of [400, 429, 500, 502]) expect(friendlyError(s)).not.toMatch(/\d{3}/);
  });

  it("a fair-use 429 shows the server's own message", async () => {
    const message = "Your next question frees up in about 5 minutes.";
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ error: "rate_limited", message, retryAfterSeconds: 300 }, { status: 429, headers: { "retry-after": "300" } })));
    const events: StreamEvent[] = [];
    for await (const ev of askAgent({ messages: [{ role: "user", content: "hi" }], location: null, mode: "transit" })) events.push(ev);
    expect(events).toEqual([{ type: "error", message }]);
  });
});

describe("street-view context", () => {
  it("the route accepts a street-view context and the prompt names it", async () => {
    const { contextLine } = await import("./routes");
    const context = { source: "street-view" as const, lon: -73.98, lat: 40.75, heading: 90, nearestStation: "Times Sq-42 St (80 m)", nearestEntrance: null, followedTrain: null };
    const res = await app.request("/api/v1/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "which exit?" }], context }) });
    expect(res.status).toBe(200);
    await res.body?.cancel();
    expect(contextLine(context)).toContain("facing 90 degrees; nearest station Times Sq-42 St (80 m)");
  });
});
