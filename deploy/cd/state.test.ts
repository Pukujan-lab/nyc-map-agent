import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRun, currentRun, markInterrupted, readRuns } from "./state";
import { emptySteps, type Run } from "./types";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cd-state-"));
  file = join(dir, "deploys.jsonl");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (id: string, status: Run["status"], startedAt = "2026-10-21T15:00:00Z"): Run => ({
  id,
  sha: "a".repeat(40),
  kind: "deploy",
  status,
  startedAt,
  finishedAt: status === "running" ? null : startedAt,
  durationMs: status === "running" ? null : 1000,
  image: `nyc-map-agent:${id}`,
  previousImage: null,
  steps: emptySteps(),
  error: null,
});

describe("run state store", () => {
  it("returns an empty list when the file is missing", () => {
    expect(readRuns(file)).toEqual([]);
  });

  it("keeps the last record per id", () => {
    appendRun(file, run("r1", "running"));
    appendRun(file, run("r1", "succeeded"));
    const runs = readRuns(file);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("succeeded");
  });

  it("returns newest first and honours the limit", () => {
    appendRun(file, run("r1", "succeeded", "2026-10-21T15:00:00Z"));
    appendRun(file, run("r2", "succeeded", "2026-10-21T16:00:00Z"));
    appendRun(file, run("r3", "failed", "2026-10-21T17:00:00Z"));
    expect(readRuns(file, 2).map((r) => r.id)).toEqual(["r3", "r2"]);
  });

  it("skips malformed lines", () => {
    writeFileSync(file, "{not json}\n" + JSON.stringify(run("r1", "succeeded")) + "\n");
    expect(readRuns(file).map((r) => r.id)).toEqual(["r1"]);
  });

  it("currentRun ignores failed runs newer than the last good one", () => {
    appendRun(file, run("good", "succeeded", "2026-10-21T15:00:00Z"));
    appendRun(file, run("bad", "failed", "2026-10-21T16:00:00Z"));
    expect(currentRun(file)?.id).toBe("good");
  });

  it("currentRun accepts a rollback as the live state", () => {
    appendRun(file, run("good", "succeeded", "2026-10-21T15:00:00Z"));
    appendRun(file, run("back", "rolled-back", "2026-10-21T16:00:00Z"));
    expect(currentRun(file)?.id).toBe("back");
  });

  it("markInterrupted closes runs left running", () => {
    appendRun(file, run("r1", "running"));
    expect(markInterrupted(file, new Date("2026-10-21T18:00:00Z"))).toBe(1);
    expect(readRuns(file)[0].status).toBe("interrupted");
  });
});
