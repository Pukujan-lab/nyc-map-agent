import { describe, expect, it } from "vitest";
import { cityDetail, hiddenWhenFlat, isFootprint, mapLevel, wantsFlatBuildings } from "./buildings";

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
  it("keeps flat buildings flat at street level until 3D is chosen", () => {
    expect(wantsFlatBuildings("flat")).toBe(true);
    expect(wantsFlatBuildings("3d")).toBe(false);
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

describe("Top view is flat 2D (#364)", () => {
  it("names the level from walking and tilt", () => {
    expect(mapLevel(false, false)).toBe("top");
    expect(mapLevel(false, true)).toBe("tilted");
    expect(mapLevel(true, false)).toBe("street");
    expect(mapLevel(true, true)).toBe("street");
  });
  it("draws no extrusion, skyline or textured city from straight above, even with 3D buildings", () => {
    expect(cityDetail({ level: "top", flat: false, eco: false, city3d: true, detailed: true })).toEqual({ extrude: false, skyline: false, textured: false });
  });
  it("brings 3D back when tilted or walking", () => {
    expect(cityDetail({ level: "tilted", flat: false, eco: false, city3d: false, detailed: false }).extrude).toBe(true);
    expect(cityDetail({ level: "street", flat: false, eco: false, city3d: true, detailed: false })).toEqual({ extrude: true, skyline: true, textured: true });
  });
});

describe("simple block map by default, detailed city optional (#363)", () => {
  const base = { flat: true, eco: false, city3d: false, detailed: false };
  it("tilted views draw plain extruded blocks, even under the Flat default, and nothing heavier", () => {
    expect(cityDetail({ ...base, level: "tilted" })).toEqual({ extrude: true, skyline: false, textured: false });
    expect(cityDetail({ ...base, flat: false, city3d: true, level: "tilted" })).toEqual({ extrude: true, skyline: false, textured: false });
  });
  it("the detailedCity flag brings the skyline and textured city back above street level, except in eco", () => {
    expect(cityDetail({ ...base, detailed: true, level: "tilted" })).toEqual({ extrude: true, skyline: true, textured: true });
    expect(cityDetail({ ...base, detailed: true, eco: true, level: "tilted" })).toEqual({ extrude: true, skyline: false, textured: false });
  });
  it("street level is the 3D city even under the Flat default, except in eco", () => {
    expect(cityDetail({ ...base, level: "street" })).toEqual({ extrude: true, skyline: true, textured: false });
    expect(cityDetail({ ...base, city3d: true, level: "street" })).toEqual({ extrude: true, skyline: true, textured: true });
    expect(cityDetail({ ...base, eco: true, city3d: true, level: "street" })).toEqual({ extrude: false, skyline: false, textured: false });
    expect(cityDetail({ ...base, flat: false, city3d: true, level: "street" })).toEqual({ extrude: true, skyline: true, textured: true });
  });
});
