import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import { app } from "./app";

type Doc = { info: { version: string }; paths: Record<string, Record<string, { deprecated?: boolean }>> };
const doc = async (path: string) => (await (await app.request(path)).json()) as Doc;

describe("API versioning", () => {
  it("serves the spec at /api/v1 and the /api alias, versioned like the package", async () => {
    const v1 = await doc("/api/v1/openapi.json");
    const alias = await doc("/api/openapi.json");
    expect(v1).toEqual(alias);
    expect(v1.info.version).toBe(pkg.version);
  });
  it("documents every route under /api/v1 and marks the unversioned alias deprecated", async () => {
    const spec = await doc("/api/v1/openapi.json");
    const paths = Object.keys(spec.paths);
    const legacy = paths.filter((p) => !p.startsWith("/api/v1/"));
    expect(legacy.length).toBeGreaterThan(0);
    for (const p of legacy) {
      expect(paths).toContain(p.replace(/^\/api\//, "/api/v1/"));
      for (const op of Object.values(spec.paths[p])) expect(op.deprecated).toBe(true);
    }
  });
  it("answers the same 400 on both prefixes", async () => {
    const a = await app.request("/api/v1/street");
    const b = await app.request("/api/street");
    expect(a.status).toBe(400);
    expect(b.status).toBe(a.status);
    expect(await b.json()).toEqual(await a.json());
  });
  it("returns the JSON 404 under /api/v1", async () => {
    const r = await app.request("/api/v1/nope");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not_found" });
  });
});
