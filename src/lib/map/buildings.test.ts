import { describe, expect, it } from "vitest";
import { hiddenWhenFlat, isFootprint } from "./buildings";

describe("calm buildings", () => {
  it("hides extruded basemap buildings and block shading when flat", () => {
    expect(hiddenWhenFlat({ id: "building-3d", type: "fill-extrusion", "source-layer": "building" })).toBe(true);
    expect(hiddenWhenFlat({ id: "block-tile-fill", type: "fill" })).toBe(true);
    expect(hiddenWhenFlat({ id: "transit-viaduct", type: "fill-extrusion" })).toBe(false);
  });
  it("uses the basemap footprint layer for flat buildings", () => {
    expect(isFootprint({ id: "building", type: "fill", "source-layer": "building" })).toBe(true);
    expect(isFootprint({ id: "water", type: "fill", "source-layer": "water" })).toBe(false);
  });
});

describe("building contrast (#2)", () => {
  it("every theme keeps footprints visibly darker than the land, with a darker edge", async () => {
    const { THEMES, DUSK, buildingEdge, contrastRatio } = await import("@/lib/theme");
    for (const p of [THEMES.ivory, THEMES.mta, THEMES.ink, THEMES.neon, DUSK]) {
      expect(contrastRatio(p.land, p.building)).toBeGreaterThanOrEqual(1.15);
      expect(contrastRatio(p.land, buildingEdge(p))).toBeGreaterThanOrEqual(1.6);
    }
  });
});
