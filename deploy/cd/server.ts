import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  checkBearer,
  checkPassword,
  createRateLimiter,
  sessionExpiry,
  signSession,
  SESSION_COOKIE,
  verifySession,
} from "./auth";
import { BusyError, startDeploy, type PipelineConfig } from "./pipeline";
import { createRunner, type Runner } from "./runner";
import { currentRun, markInterrupted, readRuns } from "./state";
import type { Run } from "./types";

export interface ServerConfig {
  password: string;
  sessionSecret: string;
  deployToken: string;
  stateFile: string;
  pipeline: PipelineConfig;
  now?: () => Date;
}

export interface LogStore {
  append(runId: string, line: string): void;
  lines(runId: string): string[];
  waiters(runId: string): Set<(line: string) => void>;
  done(runId: string): void;
  isDone(runId: string): boolean;
}

export function createLogStore(cap = 5_000): LogStore {
  const buffers = new Map<string, string[]>();
  const listeners = new Map<string, Set<(line: string) => void>>();
  const finished = new Set<string>();
  return {
    append(runId, line) {
      const buf = buffers.get(runId) ?? [];
      buf.push(line);
      if (buf.length > cap) buf.splice(0, buf.length - cap);
      buffers.set(runId, buf);
      for (const fn of listeners.get(runId) ?? []) fn(line);
    },
    lines: (runId) => buffers.get(runId) ?? [],
    waiters(runId) {
      let set = listeners.get(runId);
      if (!set) {
        set = new Set();
        listeners.set(runId, set);
      }
      return set;
    },
    done: (runId) => void finished.add(runId),
    isDone: (runId) => finished.has(runId),
  };
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

/**
 * The only path to this server is Cloudflare -> cloudflared -> Caddy, so the
 * peer Cloudflare recorded in CF-Connecting-IP is the real client. Caddy appends
 * its own peer to X-Forwarded-For, so the last entry there is the tunnel
 * container, not the caller — falling back to it keeps one bucket for all
 * traffic rather than trusting a header the client controls.
 */
export function clientIp(headers: { get(k: string): string | undefined }): string {
  const cloudflare = headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").pop()?.trim();
  return last || "local";
}

export function createApp(config: ServerConfig, deps: { runner: Runner }): Hono {
  const app = new Hono();
  const limiter = createRateLimiter();
  const logs = createLogStore();
  const now = config.now ?? (() => new Date());

  const authed = (c: { req: { header: (k: string) => string | undefined } }) =>
    verifySession(config.sessionSecret, readCookie(c.req.header("cookie"), SESSION_COOKIE), now().getTime());

  // CI starts a deploy with a bearer token, then has no cookie to poll with, so
  // reading a single run accepts either credential. Status and logs stay
  // session-only.
  const authedOrBearer = (c: { req: { header: (k: string) => string | undefined } }) =>
    authed(c) || checkBearer(c.req.header("authorization"), config.deployToken);

  const unauthorized = (c: { json: (b: unknown, s: 401) => Response }) => c.json({ error: "unauthorized" }, 401);

  app.post("/deploy/api/login", async (c) => {
    const ip = clientIp({ get: (k) => c.req.header(k) });
    if (limiter.blocked(ip, now().getTime())) return c.json({ error: "rate-limited" }, 429);
    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    if (!body.password || !checkPassword(body.password, config.password)) {
      limiter.record(ip, now().getTime());
      return c.json({ error: "invalid" }, 401);
    }
    const exp = sessionExpiry(now().getTime());
    const cookie = `${SESSION_COOKIE}=${signSession(config.sessionSecret, exp)}; Path=/deploy; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor((exp - now().getTime()) / 1000)}`;
    c.header("set-cookie", cookie);
    return c.json({ ok: true });
  });

  app.post("/deploy/api/logout", (c) => {
    c.header("set-cookie", `${SESSION_COOKIE}=; Path=/deploy; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return c.json({ ok: true });
  });

  app.get("/deploy/api/status", async (c) => {
    if (!authed(c)) return unauthorized(c);
    const runs = readRuns(config.stateFile, 20);
    const live = currentRun(config.stateFile);
    let health: "healthy" | "unhealthy" | "starting" | "unknown" = "unknown";
    let subject = "";
    if (live) {
      const inspected = await deps.runner.run("docker", ["inspect", "nyc-map-web", "--format", "{{.State.Health.Status}}"]);
      const status = inspected.output.trim();
      health = status === "healthy" || status === "unhealthy" || status === "starting" ? status : "unknown";
      const show = await deps.runner.run("git", ["show", "-s", "--format=%s", live.sha], { cwd: config.pipeline.repoDir });
      subject = show.code === 0 ? show.output.trim() : "";
    }
    return c.json({
      current: live
        ? { sha: live.sha, subject, image: live.image, health, deployedAt: live.finishedAt ?? live.startedAt }
        : null,
      running: runs.find((r) => r.status === "running") ?? null,
      runs,
    });
  });

  app.get("/deploy/api/deploys/:id", (c) => {
    if (!authedOrBearer(c)) return unauthorized(c);
    const run = readRuns(config.stateFile, Number.MAX_SAFE_INTEGER).find((r) => r.id === c.req.param("id"));
    return run ? c.json(run) : c.json({ error: "not_found" }, 404);
  });

  app.get("/deploy/api/deploys/:id/log", (c) => {
    if (!authed(c)) return unauthorized(c);
    const id = c.req.param("id");
    // A finished run lives in the state file and its lines are gone after a
    // restart; an unknown id would otherwise hold the stream open forever.
    const stored = readRuns(config.stateFile, Number.MAX_SAFE_INTEGER).find((r) => r.id === id);
    const buffered = logs.lines(id);
    if (!stored && buffered.length === 0 && !logs.isDone(id)) return c.json({ error: "not_found" }, 404);
    // Nothing left to stream and the run is already over: close immediately
    // rather than waiting on a completion event this process never saw.
    if (buffered.length === 0 && stored && stored.status !== "running") {
      return streamSSE(c, async (stream) => stream.writeSSE({ event: "done", data: "{}" }));
    }
    return streamSSE(c, async (stream) => {
      for (const line of logs.lines(id)) await stream.writeSSE({ data: JSON.stringify({ line, at: now().toISOString() }) });
      if (logs.isDone(id)) return stream.writeSSE({ event: "done", data: "{}" });
      await new Promise<void>((resolve) => {
        const set = logs.waiters(id);
        const push = (line: string) => {
          void stream.writeSSE({ data: JSON.stringify({ line, at: now().toISOString() }) });
        };
        set.add(push);
        const timer = setInterval(() => {
          if (logs.isDone(id)) {
            clearInterval(timer);
            set.delete(push);
            void stream.writeSSE({ event: "done", data: "{}" }).then(() => resolve());
          }
        }, 500);
        stream.onAbort(() => {
          clearInterval(timer);
          set.delete(push);
          resolve();
        });
      });
    });
  });

  const start = (kind: "deploy" | "rollback", sha?: string): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let startedId: string | null = null;
      const onUpdate = (run: Run) => {
        if (!settled && run.sha !== "0".repeat(40)) {
          settled = true;
          startedId = run.id;
          resolve(run.id);
        }
      };
      void startDeploy(
        {
          runner: deps.runner,
          now,
          onLog: (runId, line) => logs.append(runId, line),
          onUpdate,
        },
        config.pipeline,
        kind === "deploy" ? { kind, sha } : { kind },
      )
        .then((run) => {
          logs.done(run.id);
          if (!settled) {
            settled = true;
            resolve(run.id);
          }
        })
        .catch((err: unknown) => {
          // Only surface the failure when the request is still waiting on it.
          // Once the run id is out, the run's own record carries the outcome —
          // but its log stream still has to be closed or it waits forever.
          if (settled) {
            if (startedId) logs.done(startedId);
            return;
          }
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  };

  app.post("/deploy/api/deploy", async (c) => {
    const bearer = checkBearer(c.req.header("authorization"), config.deployToken);
    if (!bearer && !authed(c)) return unauthorized(c);
    const body = (await c.req.json().catch(() => ({}))) as { sha?: string };
    if (body.sha && !/^[0-9a-f]{40}$/.test(body.sha)) return c.json({ error: "invalid_sha" }, 400);
    try {
      return c.json({ id: await start("deploy", body.sha) }, 202);
    } catch (err) {
      if (err instanceof BusyError) return c.json({ error: "busy" }, 409);
      throw err;
    }
  });

  app.post("/deploy/api/rollback", async (c) => {
    const bearer = checkBearer(c.req.header("authorization"), config.deployToken);
    if (!bearer && !authed(c)) return unauthorized(c);
    try {
      return c.json({ id: await start("rollback") }, 202);
    } catch (err) {
      if (err instanceof BusyError) return c.json({ error: "busy" }, 409);
      throw err;
    }
  });

  return app;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

if (process.env.NODE_ENV !== "test") {
  const stateDir = env("CD_STATE_DIR", "/work/state");
  const config: ServerConfig = {
    password: env("CD_ADMIN_PASSWORD"),
    sessionSecret: env("CD_SESSION_SECRET"),
    deployToken: env("CD_DEPLOY_TOKEN"),
    stateFile: join(stateDir, "deploys.jsonl"),
    pipeline: {
      repoDir: env("CD_REPO_DIR", "/app"),
      deployDir: env("CD_DEPLOY_DIR", "/app/deploy"),
      stateFile: join(stateDir, "deploys.jsonl"),
      lockDir: join(stateDir, "deploy.lock"),
      envFile: env("CD_ENV_FILE", "/work/.env"),
      buildArgs: {
        VITE_DATA_BACKEND: process.env.VITE_DATA_BACKEND ?? "octo",
        MAPILLARY_TOKEN: process.env.MAPILLARY_TOKEN ?? "",
      },
    },
  };
  if (!existsSync(stateDir)) throw new Error(`state directory ${stateDir} does not exist`);
  markInterrupted(config.stateFile);
  const port = Number(process.env.PORT ?? 8081);
  serve({ fetch: createApp(config, { runner: createRunner() }).fetch, port }, () => console.log(`nyc-map-cd on :${port}`));
}
