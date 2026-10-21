import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { streamEvent, type StreamEvent } from "../../../src/features/agent/schema";
import { POST } from "./routes";

const usage = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };
const finish = (reason: "tool-calls" | "stop") => ({ type: "finish", finishReason: { unified: reason, raw: reason }, usage }) as const;

function model() {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: () => {
      step += 1;
      const chunks =
        step === 1
          ? [{ type: "tool-call", toolCallId: "c1", toolName: "enterStreetView", input: JSON.stringify({ place: "here" }) }, finish("tool-calls")]
          : [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "You're at street level." }, { type: "text-end", id: "t" }, finish("stop")];
      return Promise.resolve({ stream: convertArrayToReadableStream(chunks as never[]) });
    },
  });
}

async function run(body: unknown): Promise<StreamEvent[]> {
  const res = await POST(new Request("http://x/api/agent", { method: "POST", body: JSON.stringify(body) }), { model: model() });
  const text = await res.text();
  return text.trim().split("\n").map((l) => streamEvent.parse(JSON.parse(l)));
}

describe("POST /api/agent (mocked LLM)", () => {
  it("rejects a bad body", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }), { model: model() });
    expect(res.status).toBe(400);
  });

  it("streams a validated map command, text and usage", async () => {
    const events = await run({ messages: [{ role: "user", content: "street view here" }], location: { lon: -73.99, lat: 40.73 } });
    expect(events.find((e) => e.type === "command")).toEqual({ type: "command", command: { type: "enterStreetView", lon: -73.99, lat: 40.73 } });
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toContain("street level");
    const done = events.find((e) => e.type === "done");
    expect(done && done.type === "done" && done.usage.inputTokens).toBeGreaterThan(0);
  });

  it("never sends a command when 'here' is unknown", async () => {
    const events = await run({ messages: [{ role: "user", content: "street view here" }] });
    expect(events.some((e) => e.type === "command")).toBe(false);
  });
});

describe("POST /api/agent: shared location privacy", () => {
  it("sends the exact coordinates to the model and never logs them", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const m = model();
    const res = await POST(
      new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "street view here" }], location: { lon: -73.990312, lat: 40.735901 } }) }),
      { model: m },
    );
    await res.text();
    expect(JSON.stringify(m.doStreamCalls[0]?.prompt)).toContain("longitude -73.990312, latitude 40.735901");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const logged = spies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c)).join("\n");
    expect(logged).not.toMatch(/73\.9903|40\.7359/);
    const outbound = fetchSpy.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(outbound).not.toMatch(/octo|r2\.|cloudflarestorage/i);
    spies.forEach((s) => s.mockRestore());
    fetchSpy.mockRestore();
  });
});
