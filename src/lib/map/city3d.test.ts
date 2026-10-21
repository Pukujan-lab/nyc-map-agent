import { describe, expect, it } from "vitest";
import { isPoiLabelLayer } from "./city3d";

describe("isPoiLabelLayer", () => {
  it("matches shop/POI symbol layers but keeps transit", () => {
    expect(isPoiLabelLayer({ id: "poi_r1", type: "symbol", "source-layer": "poi" })).toBe(true);
    expect(isPoiLabelLayer({ id: "poi_transit", type: "symbol", "source-layer": "poi" })).toBe(false);
    expect(isPoiLabelLayer({ id: "highway-name-minor", type: "symbol", "source-layer": "transportation_name" })).toBe(false);
  });
});

describe("landmarkAt", () => {
  it("finds the Empire State footprint and nothing a block away", async () => {
    const { landmarkAt } = await import("./landmarks");
    expect(landmarkAt(-73.98566, 40.74844)?.id).toBe("empire-state");
    expect(landmarkAt(-73.9875, 40.7493)).toBeUndefined();
  });
});
