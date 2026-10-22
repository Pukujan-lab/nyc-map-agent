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
