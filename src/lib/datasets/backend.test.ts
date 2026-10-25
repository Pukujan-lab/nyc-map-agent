import { afterEach, describe, expect, it, vi } from "vitest";
import type { NtaIndex } from "@/lib/geo/ntaIndex";
import { blocksPath, fetchOctoCounts } from "./backend";
import { SOURCE_BY_ID } from "./registry";

describe("blocksPath", () => {
  it("only sends filters a source supports", () => {
    const filters = { borough: "QUEENS", categories: { noise: ["Noise - Street/Sidewalk"], trees: ["x"] }, severity: ["fatal"] };
    const noise = new URL(blocksPath(SOURCE_BY_ID.noise, "90d", filters), "http://x").searchParams;
    expect(noise.get("categories")).toBe("Noise - Street/Sidewalk");
    expect(noise.get("severity")).toBeNull();
    expect(noise.get("borough")).toBe("QUEENS");
    const crashes = new URL(blocksPath(SOURCE_BY_ID.crashes, "12mo", filters), "http://x").searchParams;
    expect(crashes.get("severity")).toBe("fatal");
    expect(crashes.get("categories")).toBeNull();
  });

  it("every registry source has a guide", () => {
    for (const s of Object.values(SOURCE_BY_ID)) {
      expect(s.guide.what.length).toBeGreaterThan(10);
      expect(s.guide.caveats.length).toBeGreaterThan(10);
      expect(s.guide.cadence.length).toBeGreaterThan(2);
    }
  });
});

describe("fetchOctoCounts (#120)", () => {
  const index = { assignCode: () => "MN0501" } as unknown as NtaIndex;
  const filters = { categories: {}, severity: [] };
  const answer = (byLevel: Record<string, unknown[]>) =>
    vi.fn((url: string) => {
      const level = new URL(url, "http://x").searchParams.get("level") ?? "";
      return Promise.resolve(Response.json({ rows: byLevel[level] ?? [] }));
    });
  afterEach(() => vi.unstubAllGlobals());

  it("keys counts by tax block id, so the block tiles shade them", async () => {
    const fetch = answer({ taxblock: [{ area: "100001", n: 2.5, lat: 40.75, lon: -73.99, nta2020: "MN0501" }, { area: "100002", n: 1, lat: 40.75, lon: -73.9888, nta2020: null }] });
    vi.stubGlobal("fetch", fetch);
    const out = await fetchOctoCounts(SOURCE_BY_ID.trees, "12mo", filters, index);
    expect(Object.keys(out.blocks)).toEqual(["100001", "100002"]);
    expect(out.byNta).toEqual({ MN0501: 2.5 });
    expect(out.total).toBe(3.5);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the grid before the ingest has joined the source to blocks", async () => {
    const fetch = answer({ block: [{ r: 13583, c: -24663, n: 4 }] });
    vi.stubGlobal("fetch", fetch);
    const out = await fetchOctoCounts(SOURCE_BY_ID.trees, "12mo", filters, index);
    expect(Object.keys(out.blocks)).toEqual(["13583:-24663"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
