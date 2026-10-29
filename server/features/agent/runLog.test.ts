import { describe, expect, it, vi } from "vitest";
import { RunLog, type RunRecord } from "./runLog";

const clock = () => {
  let t = 1_000;
  return { now: () => t, tick: (ms: number) => { t += ms; } };
};

describe("RunLog", () => {
  it("records the first step, first words, each tool's time and the model that answered", () => {
    const c = clock();
    const write = vi.fn<(r: RunRecord) => Promise<void>>(() => Promise.resolve());
    const log = vi.fn();
    const run = new RunLog("cb/a", write, c.now, log, 60_000);
    c.tick(2_000); run.stepStart("t1", "geocode");
    c.tick(150); run.stepEnd("t1", true);
    c.tick(1_000); run.text(); run.text();
    run.note("[agent] model cb/a slow to start");
    run.usedModel("cb/b");
    c.tick(500); run.finish("done", { inputTokens: 10, outputTokens: 5 });
    const r = write.mock.calls[0][0];
    expect(r).toMatchObject({ model: "cb/b", outcome: "done", firstStepMs: 2_000, firstTextMs: 3_150, totalMs: 3_650, steps: [{ name: "geocode", ms: 150, status: "done" }], inputTokens: 10 });
    expect(r.notes).toHaveLength(1);
    expect(log.mock.calls[0][0]).toMatch(/^\[agent-run\] \{/);
  });

  it("writes once: a second finish is ignored", () => {
    const write = vi.fn(() => Promise.resolve());
    const run = new RunLog("m", write, Date.now, vi.fn(), 60_000);
    run.finish("done", null);
    run.finish("error", null);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("writes a stuck row, with the step still running, when nothing finishes in time", () => {
    vi.useFakeTimers();
    const write = vi.fn<(r: RunRecord) => Promise<void>>(() => Promise.resolve());
    const run = new RunLog("m", write, Date.now, vi.fn(), 45_000);
    run.stepStart("t1", "transit_plan");
    vi.advanceTimersByTime(45_000);
    expect(write.mock.calls[0][0]).toMatchObject({ outcome: "stuck", steps: [{ name: "transit_plan", status: "running" }] });
    run.finish("done", null);
    expect(write.mock.calls[1][0].outcome).toBe("done");
    vi.useRealTimers();
  });

  it("never stores message text: the record has no field for it", () => {
    const run = new RunLog("m", () => Promise.resolve(), Date.now, vi.fn(), 60_000);
    expect(Object.keys(run.record("done", null)).sort()).toEqual(["firstStepMs", "firstTextMs", "id", "inputTokens", "model", "notes", "outcome", "outputTokens", "startedAt", "steps", "totalMs"]);
    run.finish("done", null);
  });
});
