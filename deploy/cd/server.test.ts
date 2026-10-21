import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, createLogStore, clientIp, type ServerConfig } from "./server";
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

  it("lets the CI bearer token poll a run it started", async () => {
    const app = createApp(config, { runner: healthyRunner });
    const started = await call(app, "/deploy/api/deploy", {
      method: "POST",
      headers: { authorization: `Bearer ${config.deployToken}` },
      body: JSON.stringify({ sha: SHA }),
    });
    const { id } = (await started.json()) as { id: string };
    const res = await call(app, `/deploy/api/deploys/${id}`, {
      headers: { authorization: `Bearer ${config.deployToken}` },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe(id);
  });

  it("rejects a bearer token on the log stream", async () => {
    const app = createApp(config, { runner: healthyRunner });
    const res = await call(app, "/deploy/api/deploys/anything/log", {
      headers: { authorization: `Bearer ${config.deployToken}` },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 instead of holding open a log stream for an unknown run", async () => {
    const app = createApp(config, { runner: healthyRunner });
    const login = await call(app, "/deploy/api/login", { method: "POST", body: JSON.stringify({ password: "correct horse" }) });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const res = await call(app, "/deploy/api/deploys/nope/log", { headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it("records a runner that throws as a failed run rather than a stuck one", async () => {
    const failing: Runner = {
      run() {
        return Promise.reject(new Error("docker: command not found"));
      },
    };
    const app = createApp(config, { runner: failing });
    const started = await call(app, "/deploy/api/deploy", {
      method: "POST",
      headers: { authorization: `Bearer ${config.deployToken}` },
      body: JSON.stringify({ sha: SHA }),
    });
    expect(started.status).toBe(202);
    const { id } = (await started.json()) as { id: string };
    const res = await call(app, `/deploy/api/deploys/${id}`, {
      headers: { authorization: `Bearer ${config.deployToken}` },
    });
    expect(res.status).toBe(200);
    const run = (await res.json()) as { status: string; error: string | null };
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/docker: command not found/);
  });

  it("reports a second concurrent deploy as busy", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: Runner = {
      async run(cmd, args) {
        if (cmd === "git" && args[0] === "fetch") await gate;
        if (cmd === "git" && args[0] === "rev-parse") return { code: 0, output: `${SHA}\n` };
        return { code: 0, output: "healthy\n" };
      },
    };
    const app = createApp(config, { runner: slow });
    const headers = { authorization: `Bearer ${config.deployToken}` };
    const first = call(app, "/deploy/api/deploy", { method: "POST", headers, body: JSON.stringify({ sha: SHA }) });
    const second = await call(app, "/deploy/api/deploy", { method: "POST", headers, body: JSON.stringify({ sha: SHA }) });
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(202);
  });
});

describe("client ip", () => {
  const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] });

  it("prefers the Cloudflare header, which the client cannot forge", () => {
    expect(clientIp(headers({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("203.0.113.9");
  });

  it("falls back to the last X-Forwarded-For entry, which Caddy appended", () => {
    expect(clientIp(headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("2.2.2.2");
  });

  it("uses a single bucket when no address header is present", () => {
    expect(clientIp(headers({}))).toBe("local");
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
