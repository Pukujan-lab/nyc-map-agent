import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { streamEvent, type StreamEvent } from "../../../src/features/agent/schema";
import { noteSource } from "./freshness";
import { POST } from "./routes";
import type { RestroomRow } from "./services";

const usage = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };
const finish = (reason: "tool-calls" | "stop") => ({ type: "finish", finishReason: { unified: reason, raw: reason }, usage }) as const;
const say = (text: string) => [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: text }, { type: "text-end", id: "t" }, finish("stop")];

/** A scripted model: step 1 may call one tool, the last step says `reply`. */
function model(reply: string, call?: { toolName: string; input: unknown }) {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: () => {
      step += 1;
      const chunks = call && step === 1 ? [{ type: "tool-call", toolCallId: "c1", toolName: call.toolName, input: JSON.stringify(call.input) }, finish("tool-calls")] : say(reply);
      return Promise.resolve({ stream: convertArrayToReadableStream(chunks as never[]) });
    },
  });
}

async function ask(m: MockLanguageModelV4, question: string, deps?: Parameters<typeof POST>[1]["deps"]): Promise<StreamEvent[]> {
  const body = { messages: [{ role: "user", content: question }], location: { lon: -73.984, lat: 40.754 } };
  const res = await POST(new Request("http://x/api/agent", { method: "POST", body: JSON.stringify(body) }), { model: m, deps });
  return (await res.text()).trim().split("\n").map((l) => streamEvent.parse(JSON.parse(l)));
}
const sourcesOf = (events: StreamEvent[]) => events.find((e): e is Extract<StreamEvent, { type: "sources" }> => e.type === "sources");

const ROW: RestroomRow = { facility_name: "Bryant Park", latitude: "40.7536", longitude: "-73.9832", status: "Operational", hours_of_operation: "7am-10pm" };

describe("no guessing: the server flags figures no tool returned (#375)", () => {
  it("a reply that invents a number with no tool result is flagged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const events = await ask(model("There were 312 noise complaints on your block last month."), "how loud is my block?");
    expect(sourcesOf(events)).toEqual({ type: "sources", sources: [], unverified: ["312"] });
    // The "sources" line comes before "done".
    expect(events.findIndex((e) => e.type === "sources")).toBeLessThan(events.findIndex((e) => e.type === "done"));
    expect(warn.mock.calls.flat().join(" ")).not.toContain("312");
    warn.mockRestore();
  });

  it("an \"I don't know\" reply, or one repeating the user's own figure, is not flagged", async () => {
    expect(sourcesOf(await ask(model("I don't have noise data for that block."), "how loud is my block?"))).toBeUndefined();
    expect(sourcesOf(await ask(model("Leaving at 9 works."), "can I leave at 9?"))).toBeUndefined();
  });

  it("a map-only tool does not ground a figure", async () => {
    const events = await ask(model("Times Square gets 50 crashes a year.", { toolName: "flyTo", input: { place: "Times Square" } }), "crashes at times square?");
    expect(sourcesOf(events)?.unverified).toEqual(["50"]);
  });
});

describe("freshness: data answers carry their source and age (#375)", () => {
  it("a restroom answer gets a sources line, and the tool result tells the model its source and age", async () => {
    const m = model("Bryant Park is 120 meters away, open 7am to 10pm.", { toolName: "nearest_restroom", input: { place: "here" } });
    const restrooms = async () => { noteSource("restrooms", "2025-06-27T13:37:17Z"); return [ROW]; };
    const events = await ask(m, "nearest bathroom?", { restrooms });
    const line = sourcesOf(events);
    expect(line?.sources).toEqual([expect.objectContaining({ id: "restrooms", label: "NYC public restrooms", asOf: "2025-06-27T13:37:17.000Z", stale: true, url: expect.stringContaining("i7jb-7jku") })]);
    // A data tool ran, so its figures are not flagged.
    expect(line?.unverified).toEqual([]);
    const toolMsg = JSON.stringify(m.doStreamCalls[1]?.prompt);
    expect(toolMsg).toContain("NYC public restrooms");
    expect(toolMsg).toMatch(/asOf.{0,6}2025-06-27T09:37/);
  });

  it("line_status reports live alerts with the MTA feed's age and offers the skipped stops", async () => {
    const m = model("The L is skipping Bedford Av.", { toolName: "line_status", input: { lines: ["l"] } });
    const alerts = async () => { noteSource("mta-alerts", Date.now() - 30_000); return ["L trains are running with delays"]; };
    const events = await ask(m, "is the L ok?", { alerts, changes: [] });
    expect(sourcesOf(events)?.sources[0]).toMatchObject({ id: "mta-alerts", stale: false });
    expect(JSON.stringify(m.doStreamCalls[1]?.prompt)).toContain("L trains are running with delays");
  });
});
