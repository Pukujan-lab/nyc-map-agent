import { describe, expect, it } from "vitest";
import { clientIp } from "../../lib/clientIp";
import { budgetConfigFromEnv, createDailyBudget, createLimiter, limitConfigFromEnv, limitedResponse, noModelMessage } from "./fair-use";

const MIN = 60_000;
const HOUR = 60 * MIN;

function clock(start = Date.UTC(2026, 9, 23, 12, 0, 0)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("limit config", () => {
  it("defaults to 20 per 3 hours and 5 per minute", () => {
    expect(limitConfigFromEnv({})).toEqual({ windowMax: 20, windowMs: 3 * HOUR, burstMax: 5, burstMs: MIN });
  });
  it("reads overrides and ignores junk", () => {
    expect(limitConfigFromEnv({ AGENT_RATE_WINDOW_MAX: "3", AGENT_RATE_WINDOW_HOURS: "1", AGENT_RATE_BURST_MAX: "abc", AGENT_RATE_BURST_SECONDS: "-4" })).toEqual({ windowMax: 3, windowMs: HOUR, burstMax: 5, burstMs: MIN });
  });
});

describe("per-client limiter", () => {
  it("allows a burst of 5 in a minute, then refuses until the oldest leaves the minute", () => {
    const c = clock();
    const l = createLimiter({ windowMax: 20, windowMs: 3 * HOUR, burstMax: 5, burstMs: MIN }, c.now);
    const start = c.now();
    for (let i = 0; i < 5; i++) { expect(l.take("a").ok).toBe(true); c.advance(1000); }
    const r = l.take("a");
    expect(r).toEqual({ ok: false, retryAt: start + MIN, reason: "burst" });
    // Other clients are unaffected.
    expect(l.take("b").ok).toBe(true);
    c.advance(start + MIN - c.now());
    expect(l.take("a").ok).toBe(true);
  });

  it("caps the rolling window and frees each question 3 hours after it was used", () => {
    const c = clock();
    const l = createLimiter({ windowMax: 20, windowMs: 3 * HOUR, burstMax: 5, burstMs: MIN }, c.now);
    const asked: number[] = [];
    for (let i = 0; i < 20; i++) { asked.push(c.now()); expect(l.take("a").ok).toBe(true); c.advance(5 * MIN); }
    const refused = l.take("a");
    expect(refused).toEqual({ ok: false, retryAt: asked[0] + 3 * HOUR, reason: "window" });
    // A refused attempt is not counted, and only one question frees at a time.
    c.advance(asked[0] + 3 * HOUR - c.now());
    expect(l.take("a").ok).toBe(true);
    const next = l.take("a");
    expect(next).toEqual({ ok: false, retryAt: asked[1] + 3 * HOUR, reason: "window" });
  });

  it("reports the later of the two limits when both apply", () => {
    const c = clock();
    const l = createLimiter({ windowMax: 2, windowMs: HOUR, burstMax: 2, burstMs: MIN }, c.now);
    l.take("a"); l.take("a");
    const r = l.take("a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAt).toBe(c.now() + HOUR);
  });

  it("0 turns a limit off", () => {
    const l = createLimiter({ windowMax: 0, windowMs: HOUR, burstMax: 0, burstMs: MIN }, clock().now);
    for (let i = 0; i < 100; i++) expect(l.take("a").ok).toBe(true);
  });
});

describe("429 response", () => {
  it("has Retry-After in whole seconds and a friendly message with no payment wording", async () => {
    const t = Date.UTC(2026, 9, 23, 12, 0, 0);
    const res = limitedResponse(t + 42 * MIN + 500, "window", t);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe(String(42 * 60 + 1));
    const body = (await res.json()) as { error: string; message: string; retryAfterSeconds: number; retryAt: string };
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBe(42 * 60 + 1);
    expect(body.message).toMatch(/next question frees up in about 43 minutes/);
    expect(body.message).toMatch(/map/i);
    expect(body.message).toMatch(/restrooms/i);
    expect(body.message).not.toMatch(/pay|upgrade|credit|subscri|plan\b|premium/i);
  });

  it("says seconds for a short burst wait", async () => {
    const t = 1_000_000;
    const body = (await limitedResponse(t + 30_000, "burst", t).json()) as { message: string };
    expect(body.message).toMatch(/in about 30 seconds/);
  });
});

describe("daily budget", () => {
  it("defaults", () => {
    expect(budgetConfigFromEnv({})).toEqual({ softCap: 3_000_000, hardCap: 4_000_000, capModel: null });
  });

  it("switches to the cheap model past the cap, to no model past the hard cap, and resets at UTC midnight", () => {
    const c = clock(Date.UTC(2026, 9, 23, 23, 0, 0));
    const b = createDailyBudget({ softCap: 1000, hardCap: 2000, capModel: "cheap/model" }, c.now);
    expect(b.tier()).toEqual({ tier: "normal" });
    b.record(1000);
    expect(b.tier()).toEqual({ tier: "cheap", model: "cheap/model" });
    b.record(1000);
    expect(b.tier()).toEqual({ tier: "none", resetAt: Date.UTC(2026, 9, 24) });
    c.advance(HOUR);
    expect(b.tier()).toEqual({ tier: "normal" });
    expect(b.used()).toBe(0);
  });

  it("goes straight to no model past the cap when no cheap model is set", () => {
    const b = createDailyBudget({ softCap: 10, hardCap: 20, capModel: null }, clock().now);
    b.record(10);
    expect(b.tier().tier).toBe("none");
  });

  it("no-model message names the reset time and that the map still works", () => {
    const m = noModelMessage(Date.UTC(2026, 9, 24));
    expect(m).toMatch(/8:00 PM New York time/);
    expect(m).toMatch(/map/);
    expect(m).not.toMatch(/pay|upgrade|credit/i);
  });
});

describe("clientIp", () => {
  it("prefers CF-Connecting-IP, then the rightmost X-Forwarded-For entry", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 172.18.0.5" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 172.18.0.5" }))).toBe("172.18.0.5");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
