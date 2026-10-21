import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BusyError, runId, startDeploy, type PipelineConfig } from "./pipeline";
import { appendRun, readRuns } from "./state";
import { emptySteps, type Run } from "./types";
import type { RunOptions, RunResult, Runner } from "./runner";

const SHA = "a".repeat(40);
const ZERO_SHA = "0".repeat(40);

function fakeRunner(script: (cmd: string, args: string[]) => RunResult | undefined): Runner & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async run(cmd, args, opts?: RunOptions) {
      const env = Object.entries(opts?.env ?? {}).map(([k, v]) => `${k}=${v}`).join(" ");
      calls.push(`${[cmd, ...args].join(" ")}${env ? ` [${env}]` : ""}`);
      const out = script(cmd, args);
      if (out) return out;
      opts?.onLine?.("fake output");
      return { code: 0, output: "fake output" };
    },
  };
}

let dir: string;
let config: PipelineConfig;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cd-pipeline-"));
  config = {
    repoDir: dir,
    deployDir: dir,
    stateFile: join(dir, "deploys.jsonl"),
    lockDir: join(dir, "deploy.lock"),
    envFile: join(dir, ".env"),
    buildArgs: { VITE_DATA_BACKEND: "octo" },
    healthTimeoutMs: 50,
    healthPollMs: 10,
  };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const noSleep = async () => {};

const seeded = (status: Run["status"], image: string, previousImage: string | null = null): Run => ({
  id: `20261021T140000Z-${"c".repeat(12)}`,
  sha: "c".repeat(40),
  kind: "deploy",
  status,
  startedAt: "2026-10-21T14:00:00Z",
  finishedAt: "2026-10-21T14:05:00Z",
  durationMs: 300_000,
  image,
  previousImage,
  steps: emptySteps(),
  error: null,
});

describe("run ids", () => {
  it("are timestamp plus short sha", () => {
    expect(runId(new Date("2026-10-21T15:45:00Z"), SHA)).toBe("20261021T154500Z-aaaaaaaaaaaa");
  });
});

describe("deploy pipeline", () => {
  it("runs fetch, checkout, build, swap and health in order", async () => {
    const runner = fakeRunner((cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") return { code: 0, output: `${SHA}\n` };
      if (cmd === "docker" && args[0] === "inspect") return { code: 0, output: "healthy\n" };
      return undefined;
    });
    const run = await startDeploy({ runner, sleep: noSleep }, config, { kind: "deploy", sha: SHA });
    expect(run.status).toBe("succeeded");
    expect(run.steps.map((s) => [s.name, s.status])).toEqual([
      ["fetch", "succeeded"],
      ["checkout", "succeeded"],
      ["build", "succeeded"],
      ["swap", "succeeded"],
      ["health", "succeeded"],
    ]);
    expect(runner.calls.some((c) => c.startsWith("git fetch"))).toBe(true);
    expect(runner.calls.some((c) => c.includes("docker build"))).toBe(true);
    expect(runner.calls.some((c) => c.includes("up -d --no-deps web"))).toBe(true);
  });

  it("rejects a ref that is not a full sha", async () => {
    const runner = fakeRunner(() => undefined);
    await expect(startDeploy({ runner, sleep: noSleep }, config, { kind: "deploy", sha: "main" })).rejects.toThrow(/full 40-character sha/i);
  });

  it("fails the run when the build fails, without swapping", async () => {
    const runner = fakeRunner((cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") return { code: 0, output: `${SHA}\n` };
      if (cmd === "docker" && args[0] === "build") return { code: 1, output: "boom" };
      return undefined;
    });
    const run = await startDeploy({ runner, sleep: noSleep }, config, { kind: "deploy", sha: SHA });
    expect(run.status).toBe("failed");
    expect(run.steps.find((s) => s.name === "build")?.status).toBe("failed");
    expect(run.steps.find((s) => s.name === "swap")?.status).toBe("skipped");
    expect(runner.calls.some((c) => c.includes("up -d --no-deps web"))).toBe(false);
  });

  it("swaps back when the new container never becomes healthy", async () => {
    let healthChecks = 0;
    const runner = fakeRunner((cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") return { code: 0, output: `${SHA}\n` };
      if (cmd === "docker" && args[0] === "inspect" && args.includes("{{.Config.Image}}")) {
        return { code: 0, output: "nyc-map-agent:live\n" };
      }
      if (cmd === "docker" && args[0] === "inspect") {
        healthChecks += 1;
        // The new deploy stays unhealthy; after the rollback swap it is healthy.
        return { code: 0, output: healthChecks <= 1 ? "unhealthy\n" : "healthy\n" };
      }
      return undefined;
    });
    const run = await startDeploy({ runner, sleep: noSleep }, config, { kind: "deploy", sha: SHA });
    expect(run.status).toBe("failed");
    expect(run.previousImage).toBe("nyc-map-agent:live");
    expect(run.steps.find((s) => s.name === "health")?.status).toBe("failed");
    const swaps = runner.calls.filter((c) => c.includes("up -d --no-deps web"));
    expect(swaps.length).toBe(2);
    expect(swaps[0]).toContain("NYC_MAP_IMAGE=nyc-map-agent:aaaaaaaaaaaa");
    expect(swaps[1]).toContain("NYC_MAP_IMAGE=nyc-map-agent:live");
  });

  it("rollback redeploys the image the last good deploy replaced", async () => {
    appendRun(config.stateFile, seeded("succeeded", "nyc-map-agent:current", "nyc-map-agent:previous"));
    const runner = fakeRunner((cmd, args) => {
      if (cmd === "docker" && args[0] === "inspect" && args.includes("{{.Config.Image}}")) {
        return { code: 0, output: "nyc-map-agent:current\n" };
      }
      if (cmd === "docker" && args[0] === "inspect") return { code: 0, output: "healthy\n" };
      return undefined;
    });
    const run = await startDeploy({ runner, sleep: noSleep }, config, { kind: "rollback" });
    expect(run.kind).toBe("rollback");
    expect(run.status).toBe("rolled-back");
    expect(run.image).toBe("nyc-map-agent:previous");
    expect(run.sha).toBe("c".repeat(40));
    const swaps = runner.calls.filter((c) => c.includes("up -d --no-deps web"));
    expect(swaps).toHaveLength(1);
    expect(swaps[0]).toContain("NYC_MAP_IMAGE=nyc-map-agent:previous");
  });

  it("fails a rollback when there is nothing to roll back to", async () => {
    const runner = fakeRunner((cmd, args) => {
      if (cmd === "docker" && args[0] === "inspect") return { code: 1, output: "" };
      return undefined;
    });
    const run = await startDeploy({ runner, sleep: noSleep }, config, { kind: "rollback" });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/no previous image/i);
    expect(runner.calls.some((c) => c.includes("up -d --no-deps web"))).toBe(false);
  });

  it("publishes the run once the sha is known, so a running deploy is addressable", async () => {
    const seen: string[] = [];
    const runner = fakeRunner((cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") return { code: 0, output: `${SHA}\n` };
      if (cmd === "docker" && args[0] === "inspect") return { code: 0, output: "healthy\n" };
      return undefined;
    });
    await startDeploy({ runner, sleep: noSleep, onUpdate: (r) => seen.push(`${r.status}:${r.sha}`) }, config, {
      kind: "deploy",
    });
    expect(seen[0]).toBe(`running:${ZERO_SHA}`);
    expect(seen).toContain(`running:${SHA}`);
    expect(seen[seen.length - 1]).toBe(`succeeded:${SHA}`);
  });

  it("never writes a record for the provisional zero-sha id", async () => {
    const runner = fakeRunner((cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") return { code: 0, output: `${SHA}\n` };
      if (cmd === "docker" && args[0] === "inspect") return { code: 0, output: "healthy\n" };
      return undefined;
    });
    await startDeploy({ runner, sleep: noSleep }, config, { kind: "deploy" });
    const persisted = readFileSync(config.stateFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Run);
    expect(persisted.every((r) => r.sha !== ZERO_SHA)).toBe(true);
    expect(persisted.every((r) => r.id.endsWith(SHA.slice(0, 12)))).toBe(true);
  });

  it("persists a fetch failure so the run is not lost", async () => {
    const runner = fakeRunner((cmd, args) => {
      if (cmd === "git" && args[0] === "fetch") return { code: 128, output: "fatal: no remote" };
      return undefined;
    });
    const run = await startDeploy({ runner, sleep: noSleep }, config, { kind: "deploy", sha: SHA });
    expect(run.status).toBe("failed");
    expect(run.steps.find((s) => s.name === "fetch")?.status).toBe("failed");
    expect(readRuns(config.stateFile).map((r) => r.id)).toEqual([run.id]);
  });

  it("refuses a second concurrent run", async () => {
    const runner = fakeRunner((cmd, args) => {
      if (cmd === "git" && args[0] === "rev-parse") return { code: 0, output: `${SHA}\n` };
      return undefined;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: Runner = {
      async run(cmd, args, opts) {
        if (cmd === "git" && args[0] === "fetch") await gate;
        return runner.run(cmd, args, opts);
      },
    };
    const first = startDeploy({ runner: slow, sleep: noSleep }, config, { kind: "deploy", sha: SHA });
    await new Promise((r) => setTimeout(r, 10));
    await expect(startDeploy({ runner, sleep: noSleep }, config, { kind: "deploy", sha: SHA })).rejects.toBeInstanceOf(BusyError);
    release();
    await first;
  });
});
