import { describe, expect, it } from "vitest";
import { addTaxBlocks, blocksPath } from "./backend";
import { isBlockKeyed } from "./blockKeyed";
import { emptyCounts } from "./fetchSource";
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

  it("adds block-keyed rows under the tile feature id and rolls them up by neighborhood", () => {
    expect(isBlockKeyed("311")).toBe(true);
    expect(isBlockKeyed("trees")).toBe(false);
    const out = emptyCounts("311", []);
    addTaxBlocks(out, [
      { block_id: 300585, n: 12, lat: 40.69, lon: -73.99, nta2020: "BK0201" },
      { block_id: 300586, n: 3, lat: 40.7, lon: -73.98, nta2020: "BK0201" },
      { block_id: 100001, n: 0, lat: 40.7, lon: -74, nta2020: "MN0101" },
      { block_id: 100002, n: 4, lat: 40.7, lon: -74, nta2020: null },
    ]);
    expect(Object.keys(out.blocks).sort()).toEqual(["100002", "300585", "300586"]);
    expect(out.blocks["300585"]).toEqual({ lat: 40.69, lon: -73.99, ntaCode: "BK0201", count: 12 });
    expect(out.byNta).toEqual({ BK0201: 15 });
    expect(out.total).toBe(19);
  });

  it("every registry source has a guide", () => {
    for (const s of Object.values(SOURCE_BY_ID)) {
      expect(s.guide.what.length).toBeGreaterThan(10);
      expect(s.guide.caveats.length).toBeGreaterThan(10);
      expect(s.guide.cadence.length).toBeGreaterThan(2);
    }
  });
});
