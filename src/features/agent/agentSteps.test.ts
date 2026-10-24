import { describe, expect, it } from "vitest";
import { applyStep, statusLine, stepLabel, type AgentStep } from "./agentSteps";
import type { StreamEvent } from "./schema";

const fold = (evs: StreamEvent[]) => evs.reduce<AgentStep[]>(applyStep, []);

describe("agent steps (#370)", () => {
  it("pairs a step start with its end and keeps one row per tool call", () => {
    const steps = fold([
      { type: "tool", name: "geocode" },
      { type: "step", id: "a", name: "geocode", status: "start" },
      { type: "step", id: "a", name: "geocode", status: "done" },
      { type: "tool", name: "transit_plan" },
      { type: "step", id: "b", name: "transit_plan", status: "start" },
    ]);
    expect(steps).toEqual([
      { id: "a", name: "geocode", status: "done" },
      { id: "b", name: "transit_plan", status: "start" },
    ]);
    expect(statusLine(steps)).toBe("Checking the trains…");
  });

  it("still shows rows from an older server that sends only tool lines", () => {
    const steps = fold([{ type: "tool", name: "geocode" }, { type: "tool", name: "nearest_restroom" }]);
    expect(steps.map((s) => [s.name, s.status])).toEqual([["geocode", "done"], ["nearest_restroom", "start"]]);
    expect(fold([{ type: "tool", name: "geocode" }, { type: "done", model: "m", usage: { inputTokens: 1, outputTokens: 1 } }])[0].status).toBe("done");
  });

  it("marks running steps failed on an error", () => {
    expect(fold([{ type: "step", id: "a", name: "route_walk", status: "start" }, { type: "error", message: "x" }])[0].status).toBe("error");
  });

  it("labels known and unknown tools in plain words", () => {
    expect(stepLabel("nearest_restroom")).toBe("Finding restrooms nearby");
    expect(stepLabel("data_query")).toBe("Data query");
    expect(stepLabel("placeSearch")).toBe("Place search");
    expect(statusLine([])).toBe("One moment, I'm working on it…");
  });
});
