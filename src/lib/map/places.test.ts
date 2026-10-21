import { describe, expect, it } from "vitest";
import { POI_LAYERS, readPlaces } from "./places";

describe("places", () => {
  it("are hidden unless the person turned them on", () => {
    expect(readPlaces({ getItem: () => null })).toBe(false);
    expect(readPlaces({ getItem: () => "on" })).toBe(true);
  });
  it("targets only the basemap place-icon layers", () => {
    expect(["poi_r1", "poi_r7", "poi_r20"].every((id) => POI_LAYERS.test(id))).toBe(true);
    expect(POI_LAYERS.test("poi_transit")).toBe(false);
  });
});
