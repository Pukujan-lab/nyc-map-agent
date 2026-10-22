import { appendRun, currentRun } from "./state";
import { acquireLock, releaseLock } from "./lock";
import type { Runner } from "./runner";
import { emptySteps, type Run, type Step, type StepName } from "./types";

export interface PipelineConfig {
  repoDir: string;
  deployDir: string;
  stateFile: string;
  lockDir: string;
  envFile: string;
  buildArgs: Record<string, string>;
  healthTimeoutMs?: number;
  healthPollMs?: number;
}

export interface PipelineDeps {
  runner: Runner;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  onLog?: (runId: string, line: string) => void;
  /** Called on every state change, including the first one after the sha resolves. */
  onUpdate?: (run: Run) => void;
}

export type DeployRequest = { kind: "deploy"; sha?: string } | { kind: "rollback" };

export class BusyError extends Error {
  constructor() {
    super("a deploy is already running");
    this.name = "BusyError";
  }
}

const CONTAINER = "nyc-map-web";
const ZERO_SHA = "0".repeat(40);

export function runId(date: Date, sha: string): string {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${sha.slice(0, 12)}`;
}

export async function startDeploy(deps: PipelineDeps, config: PipelineConfig, request: DeployRequest): Promise<Run> {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const { runner } = deps;

  if (request.kind === "deploy" && request.sha && !/^[0-9a-f]{40}$/.test(request.sha)) {
    throw new Error("sha must be a full 40-character sha");
  }
  if (!acquireLock(config.lockDir, { nowMs: now().getTime() })) throw new BusyError();

  const startedAt = now();
  // A deploy's id carries its sha, known up front when CI supplies one and
  // resolved from origin/main otherwise. A rollback's sha is the commit the last
  // good deploy replaced, read from the state file once the lock is held.
  const provisionalSha = request.kind === "deploy" ? (request.sha ?? ZERO_SHA) : ZERO_SHA;
  let run: Run = {
    id: runId(startedAt, provisionalSha),
    sha: provisionalSha,
    kind: request.kind,
    status: "running",
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    durationMs: null,
    image: "",
    previousImage: null,
    steps: emptySteps(),
    error: null,
  };

  const lines: string[] = [];
  const log = (line: string) => {
    lines.push(line);
    deps.onLog?.(run.id, line);
  };
  const publish = (next: Run): Run => {
    const previousId = run.id;
    run = next;
    // Until the sha is known the record has a placeholder id; persisting it would
    // leave a phantom "running" run in the history under a second id. Once the sha
    // is known — supplied by CI or resolved from origin/main — every transition is
    // persisted, so /status lists the run while it is still in progress. A terminal
    // record is always written, so a fetch failure is not lost.
    const provisional = run.sha === ZERO_SHA && run.status === "running";
    if (!provisional) appendRun(config.stateFile, run);
    // Lines logged before the id was known were keyed to the placeholder; replay
    // them under the real id so the SSE stream replays completely.
    if (run.id !== previousId) for (const line of lines) deps.onLog?.(run.id, line);
    deps.onUpdate?.(run);
    return run;
  };
  const step = (name: StepName, status: Step["status"]): Run => {
    const at = now();
    return publish({
      ...run,
      steps: run.steps.map((s) =>
        s.name === name
          ? {
              ...s,
              status,
              startedAt: status === "running" ? at.toISOString() : s.startedAt,
              finishedAt: status === "succeeded" || status === "failed" ? at.toISOString() : s.finishedAt,
            }
          : s,
      ),
    });
  };
  const finish = (status: Run["status"], error: string | null): Run => {
    const ended = now();
    return publish({
      ...run,
      status,
      error,
      finishedAt: ended.toISOString(),
      durationMs: ended.getTime() - startedAt.getTime(),
      // A run that stops early leaves later steps untouched; "skipped" is what the
      // dashboard renders for them, so mark them here rather than at every exit.
      steps: run.steps.map((s) => (s.status === "pending" ? { ...s, status: "skipped" } : s)),
    });
  };

  publish(run);
  try {
    // fetch
    step("fetch", "running");
    log("git fetch origin");
    const fetched = await runner.run("git", ["fetch", "--prune", "origin", "main"], { cwd: config.repoDir, onLine: log });
    if (fetched.code !== 0) {
      step("fetch", "failed");
      return finish("failed", "git fetch failed");
    }
    if (request.kind === "deploy") {
      const resolved = await runner.run(
        "git",
        ["rev-parse", request.sha ? `${request.sha}^{commit}` : "origin/main^{commit}"],
        { cwd: config.repoDir, onLine: log },
      );
      const sha = resolved.output.trim().split("\n").pop() ?? "";
      if (resolved.code !== 0 || !/^[0-9a-f]{40}$/.test(sha)) {
        step("fetch", "failed");
        return finish("failed", "could not resolve the requested ref");
      }
      // The id carries the sha, so it is published once here — the server answers
      // the HTTP request on this update.
      publish({ ...run, id: runId(startedAt, sha), sha });
    }
    step("fetch", "succeeded");

    // The image running right now: what an automatic swap-back restores, and what
    // a manual rollback is moving away from.
    const current = await runner.run("docker", ["inspect", CONTAINER, "--format", "{{.Config.Image}}"], { onLine: log });
    const liveImage = current.code === 0 ? current.output.trim() || null : null;

    // A manual rollback restores the image the last good deploy replaced. That run
    // carries both the sha (so this run is identifiable) and the replaced image.
    const previous = request.kind === "rollback" ? currentRun(config.stateFile) : null;
    publish({
      ...run,
      previousImage: liveImage,
      ...(previous ? { sha: previous.sha, id: runId(startedAt, previous.sha) } : {}),
    });
    log(`live image: ${liveImage ?? "unknown"}`);

    const targetImage =
      request.kind === "rollback" ? (previous?.previousImage ?? "") : `nyc-map-agent:${run.sha.slice(0, 12)}`;

    if (request.kind === "rollback" && !targetImage) {
      return finish("failed", "no previous image to roll back to");
    }

    if (request.kind === "deploy") {
      // checkout
      step("checkout", "running");
      const checkout = await runner.run("git", ["checkout", "--detach", run.sha], { cwd: config.repoDir, onLine: log });
      if (checkout.code !== 0) {
        step("checkout", "failed");
        return finish("failed", "git checkout failed");
      }
      const clean = await runner.run("git", ["clean", "-xdf"], { cwd: config.repoDir, onLine: log });
      if (clean.code !== 0) {
        step("checkout", "failed");
        return finish("failed", "git clean failed");
      }
      step("checkout", "succeeded");

      // build
      step("build", "running");
      const buildArgs = Object.entries(config.buildArgs).flatMap(([k, v]) => ["--build-arg", `${k}=${v}`]);
      const built = await runner.run("docker", ["build", "-t", targetImage, ...buildArgs, "."], {
        cwd: config.repoDir,
        onLine: log,
      });
      if (built.code !== 0) {
        step("build", "failed");
        return finish("failed", "docker build failed");
      }
      step("build", "succeeded");
    } else {
      step("checkout", "skipped");
      step("build", "skipped");
    }

    // swap
    step("swap", "running");
    if (!(await swap(config, runner, targetImage, log))) {
      step("swap", "failed");
      return finish("failed", "docker compose up failed");
    }
    publish({ ...run, image: targetImage });
    step("swap", "succeeded");

    // health
    step("health", "running");
    if (!(await waitHealthy(config, runner, sleep, log))) {
      step("health", "failed");
      log(`health check failed; rolling back to ${run.previousImage ?? "nothing"}`);
      if (run.previousImage && run.previousImage !== targetImage) {
        await swap(config, runner, run.previousImage, log);
        await waitHealthy(config, runner, sleep, log);
        // The swap-back is what is live now; a failed run that still names the
        // image it failed to keep would misreport the host's actual state.
        publish({ ...run, image: run.previousImage });
      }
      return finish("failed", "the new container never became healthy");
    }
    step("health", "succeeded");

    return finish(request.kind === "rollback" ? "rolled-back" : "succeeded", null);
  } catch (err) {
    // A runner that throws (missing binary, spawn failure) would otherwise leave
    // the record `running` forever, which /status reports as a live deploy.
    finish("failed", err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    releaseLock(config.lockDir);
  }
}

async function swap(config: PipelineConfig, runner: Runner, image: string, onLine: (line: string) => void): Promise<boolean> {
  const result = await runner.run(
    "docker",
    [
      "compose",
      "-f",
      `${config.deployDir}/docker-compose.yml`,
      "--project-directory",
      config.deployDir,
      "--env-file",
      config.envFile,
      "up",
      "-d",
      "--no-deps",
      "web",
    ],
    { cwd: config.deployDir, env: { NYC_MAP_IMAGE: image }, onLine },
  );
  return result.code === 0;
}

async function waitHealthy(
  config: PipelineConfig,
  runner: Runner,
  sleep: (ms: number) => Promise<void>,
  onLine: (line: string) => void,
): Promise<boolean> {
  const timeoutMs = config.healthTimeoutMs ?? 90_000;
  const pollMs = config.healthPollMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await runner.run("docker", ["inspect", CONTAINER, "--format", "{{.State.Health.Status}}"], { onLine });
    const status = result.output.trim();
    if (result.code === 0 && status === "healthy") return true;
    if (status === "unhealthy") return false;
    await sleep(pollMs);
  }
  return false;
}
