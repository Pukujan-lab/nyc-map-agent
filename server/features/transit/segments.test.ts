import { beforeEach, describe, expect, it, vi } from "vitest";

const octoQuery = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>();
vi.mock("../../../api/_lib/octo", () => ({ octoQuery: (sql: string, params: unknown[]) => octoQuery(sql, params), OctoError: class extends Error {} }));
const { GET_ALL } = await import("./segments");

const row = (route: string) => ({ route, dir: 0, from_stop: "A02N", to_stop: "A03N", kind: "travel", n: 9, median_s: 90, p80_s: 120 });

describe("/api/transit-segments/all", () => {
  beforeEach(() => { octoQuery.mockReset(); octoQuery.mockResolvedValue({ rows: [row("A"), row("G")] }); });

  it("answers every route in one query, keyed by route, with empty lists for routes without rows", async () => {
    const res = await GET_ALL(new Request("http://x/api/transit-segments/all?routes=G,A,C&dow=3&hour=8"));
    expect(res.status).toBe(200);
    expect(octoQuery).toHaveBeenCalledTimes(1);
    expect(octoQuery.mock.calls[0][1]).toEqual([["A", "C", "G"], 3, 8]);
    const body = (await res.json()) as { dow: number; hour: number; routes: Record<string, unknown[]> };
    expect(body).toMatchObject({ dow: 3, hour: 8 });
    expect(Object.keys(body.routes).sort()).toEqual(["A", "C", "G"]);
    expect(body.routes.C).toEqual([]);
    expect(body.routes.A).toEqual([{ dir: 0, from: "A02N", to: "A03N", kind: "travel", n: 9, median: 90, p80: 120 }]);
  });

  it("caches a pinned hour of the week for hours at the edge, and the current hour for 15 minutes", async () => {
    const pinned = await GET_ALL(new Request("http://x/api/transit-segments/all?routes=A&dow=1&hour=0"));
    expect(pinned.headers.get("cache-control")).toContain("s-maxage=21600");
    const now = await GET_ALL(new Request("http://x/api/transit-segments/all?routes=A"));
    expect(now.headers.get("cache-control")).toContain("s-maxage=900");
  });

  it("rejects a bad route list before querying", async () => {
    expect((await GET_ALL(new Request("http://x/api/transit-segments/all?routes=A;drop"))).status).toBe(400);
    expect((await GET_ALL(new Request("http://x/api/transit-segments/all"))).status).toBe(400);
    expect(octoQuery).not.toHaveBeenCalled();
  });
});
