import { describe, expect, it } from "vitest";
import { blocksPath } from "./backend";
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
