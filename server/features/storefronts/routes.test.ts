import { afterEach, describe, expect, it, vi } from "vitest";

const octoQuery = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>();
vi.mock("../../../api/_lib/octo", () => ({ octoQuery: (sql: string, params: unknown[]) => octoQuery(sql, params), octoConfigFromEnv: () => ({}), OctoError: class extends Error {} }));

const { GET_LOGO } = await import("./routes");

afterEach(() => { vi.unstubAllGlobals(); octoQuery.mockReset(); });

describe("GET /api/storefronts/logo", () => {
  it("an id Wikidata does not know is no logo (404), not an upstream error, and is not stored", async () => {
    octoQuery.mockResolvedValue({ rows: [] });
    const fetch = vi.fn(() => Promise.resolve(new Response("Not Found", { status: 404 })));
    vi.stubGlobal("fetch", fetch);
    const res = await GET_LOGO(new Request("http://x/api/v1/storefronts/logo?qid=Q999999050"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_logo" });
    expect(octoQuery.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("a Wikidata outage is still an upstream error", async () => {
    octoQuery.mockResolvedValue({ rows: [] });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 503 }))));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET_LOGO(new Request("http://x/api/v1/storefronts/logo?qid=Q999999051"))).status).toBe(502);
  });
});
