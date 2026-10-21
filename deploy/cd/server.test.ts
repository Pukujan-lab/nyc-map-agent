import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, createLogStore, type ServerConfig } from "./server";
import type { Runner } from "./runner";

const SHA = "a".repeat(40);
let dir: string;
let config: ServerConfig;

const healthyRunner: Runner = {
  run(cmd, args, opts) {
    if (cmd === "git" && args[0] === "rev-parse") return Promise.resolve({ code: 0, output: `${SHA}\n` });
    if (cmd === "docker" && args[0] === "inspect" && args.includes("{{.Config.Image}}")) return Promise.resolve({ code: 0, output: "nyc-map-agent:old\n" });
    if (cmd === "docker" && args[0] === "inspect") return Promise.resolve({ code: 0, output: "healthy\n" });
    opts?.onLine?.("line");
    return Promise.resolve({ code: 0, output: "line" });
  },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cd-server-"));
  config = {
    password: "correct horse",
    sessionSecret: "s".repeat(32),
    deployToken: "t".repeat(32),
    stateFile: join(dir, "deploys.jsonl"),
    pipeline: {
      repoDir: dir,
      deployDir: dir,
      stateFile: join(dir, "deploys.jsonl"),
      lockDir: join(dir, "deploy.lock"),
      envFile: join(dir, ".env"),
      buildArgs: {},
      healthTimeoutMs: 20,
      healthPollMs: 5,
    },
  };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const call = (app: ReturnType<typeof createApp>, path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://x${path}`, init));

describe("deploy API", () => {
  it("returns 401 for status without a session", async () => {
    const app = createApp(config, { runner: healthyRunner });
    expect((await call(app, "/deploy/api/status")).status).toBe(401);
  });

  it("sets a cookie on the right password and rejects the wrong one", async () => {
    const app = createApp(config, { runner: healthyRunner });
    const bad = await call(app, "/deploy/api/login", { method: "POST", body: JSON.stringify({ password: "nope" }) });
    expect(bad.status).toBe(401);
    const ok = await call(app, "/deploy/api/login", { method: "POST", body: JSON.stringify({ password: "correct horse" }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("nyc_cd_session=");
    expect(ok.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("serves status with a valid session", async () => {
    const app = createApp(config, { runner: healthyRunner });
    const login = await call(app, "/deploy/api/login", { method: "POST", body: JSON.stringify({ password: "correct horse" }) });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const res = await call(app, "/deploy/api/status", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: unknown[]; current: unknown };
    expect(body.runs).toEqual([]);
    expect(body.current).toBeNull();
  });

  it("accepts a bearer token on deploy and returns a run id", async () => {
    const app = createApp(config, { runner: healthyRunner });
    const res = await call(app, "/deploy/api/deploy", {
      method: "POST",
      headers: { authorization: `Bearer ${config.deployToken}` },
      body: JSON.stringify({ sha: SHA }),
    });
    expect(res.status).toBe(202);
    expect(((await res.json()) as { id: string }).id).toContain(SHA.slice(0, 12));
  });

  it("rejects a bearer token on status", async () => {
    const app = createApp(config, { runner: healthyRunner });
    const res = await call(app, "/deploy/api/status", { headers: { authorization: `Bearer ${config.deployToken}` } });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed sha", async () => {
    const app = createApp(config, { runner: healthyRunner });
    const res = await call(app, "/deploy/api/deploy", {
      method: "POST",
      headers: { authorization: `Bearer ${config.deployToken}` },
      body: JSON.stringify({ sha: "main" }),
    });
    expect(res.status).toBe(400);
  });

  it("rate-limits repeated bad passwords", async () => {
    const app = createApp(config, { runner: healthyRunner });
    for (let i = 0; i < 5; i++) {
      await call(app, "/deploy/api/login", { method: "POST", body: JSON.stringify({ password: "nope" }) });
    }
    const res = await call(app, "/deploy/api/login", { method: "POST", body: JSON.stringify({ password: "correct horse" }) });
    expect(res.status).toBe(429);
  });

  it("returns 404 for an unknown run", async () => {
    const app = createApp(config, { runner: healthyRunner });
    const login = await call(app, "/deploy/api/login", { method: "POST", body: JSON.stringify({ password: "correct horse" }) });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    expect((await call(app, "/deploy/api/deploys/nope", { headers: { cookie } })).status).toBe(404);
  });
});

describe("log store", () => {
  it("replays lines and notifies waiters", () => {
    const store = createLogStore();
    const seen: string[] = [];
    store.append("r1", "one");
    store.waiters("r1").add((l) => seen.push(l));
    store.append("r1", "two");
    expect(store.lines("r1")).toEqual(["one", "two"]);
    expect(seen).toEqual(["two"]);
  });

  it("caps retained lines", () => {
    const store = createLogStore(3);
    for (const line of ["a", "b", "c", "d"]) store.append("r1", line);
    expect(store.lines("r1")).toEqual(["b", "c", "d"]);
  });
});
