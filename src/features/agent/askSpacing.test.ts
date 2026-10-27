import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gapLeft, markAsked, QUESTION_GAP_MS, resetSpacing, waitFor } from "./askSpacing";
import { askAgent } from "./stream";
import type { AgentRequest, StreamEvent } from "./schema";

const ndjson = (lines: object[]) => new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", { status: 200 });
const limited = (s: number, message = "One moment between questions, please.") =>
  Response.json({ error: "rate_limited", message, retryAfterSeconds: s }, { status: 429, headers: { "retry-after": String(s) } });

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

const req: AgentRequest = { mode: "transit", location: null, messages: [{ role: "user", content: "Plan my trip to Times Square" }] };

describe("question spacing", () => {
  beforeEach(() => { vi.useFakeTimers(); resetSpacing(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("only the time left in the gap", () => {
    expect(gapLeft(10_000, 8_000)).toBe(QUESTION_GAP_MS - 2_000);
    expect(gapLeft(20_000, 8_000)).toBe(0);
  });

  it("waitFor ends early when a newer question aborts it", async () => {
    const ctl = new AbortController();
    const p = waitFor(5_000, ctl.signal);
    ctl.abort();
    await expect(p).resolves.toBe(false);
  });

  it("holds a second question until the gap ends, then sends it; no refusal shown", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ndjson([{ type: "text", text: "Take the 1 train." }])));
    vi.stubGlobal("fetch", fetchMock);
    markAsked(Date.now());
    const waits: boolean[] = [];
    const p = collect(askAgent(req, undefined, (w) => waits.push(w)));
    await vi.advanceTimersByTimeAsync(QUESTION_GAP_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const evs = await p;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([true, false]);
    expect(evs).toEqual([{ type: "text", text: "Take the 1 train." }]);
  });

  it("waits out a short server refusal and retries instead of showing it", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(limited(2)).mockResolvedValueOnce(ndjson([{ type: "text", text: "ok" }]));
    vi.stubGlobal("fetch", fetchMock);
    const p = collect(askAgent(req));
    await vi.advanceTimersByTimeAsync(2_000);
    const evs = await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(evs).toEqual([{ type: "text", text: "ok" }]);
  });

  it("still shows a long fair-use refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(limited(3600, "You've used your share of assistant questions for now."))));
    const evs = await collect(askAgent(req));
    expect(evs).toEqual([{ type: "error", message: "You've used your share of assistant questions for now." }]);
  });

  it("a held question that is replaced never goes out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    markAsked(Date.now());
    const ctl = new AbortController();
    const p = collect(askAgent(req, ctl.signal));
    await vi.advanceTimersByTimeAsync(1_000);
    ctl.abort();
    expect(await p).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
