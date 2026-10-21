import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";
import { streamEvent, type StreamEvent } from "../../../src/features/agent/schema";
import { POST } from "./routes";

const usage = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };
const finish = (reason: "tool-calls" | "stop") => ({ type: "finish", finishReason: { unified: reason, raw: reason }, usage }) as const;

function model() {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      step += 1;
      const chunks =
        step === 1
          ? [{ type: "tool-call", toolCallId: "c1", toolName: "enterStreetView", input: JSON.stringify({ place: "here" }) }, finish("tool-calls")]
          : [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "You're at street level." }, { type: "text-end", id: "t" }, finish("stop")];
      return { stream: convertArrayToReadableStream(chunks as never[]) };
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
