import { describe, expect, it } from "vitest";
import { NEAREST_COUNT, STREET_CAP, nearestRestrooms, restroomsForView } from "./layers";

const pt = (name: string, lon: number, lat: number): GeoJSON.Feature => ({
  type: "Feature",
  properties: { name },
  geometry: { type: "Point", coordinates: [lon, lat] },
});

const names = (fc: GeoJSON.FeatureCollection) => fc.features.map((f) => String((f.properties as { name: string }).name));

describe("nearestRestrooms", () => {
  const all: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      pt("Bronx", -73.9, 40.85),
      pt("Union Sq", -73.9903, 40.7359),
      pt("Staten Island", -74.15, 40.58),
      pt("Madison Sq", -73.9877, 40.7424),
      pt("Brooklyn", -73.95, 40.68),
      pt("Bryant Park", -73.9832, 40.7536),
      pt("Queens", -73.8, 40.72),
      pt("Tompkins", -73.9818, 40.7265),
    ],
  };
  it("keeps only the closest few, nearest first", () => {
    const out = nearestRestrooms(all, [-73.989, 40.739]);
    expect(out.features).toHaveLength(NEAREST_COUNT);
    expect(names(out).slice(0, 4)).toEqual(["Union Sq", "Madison Sq", "Tompkins", "Bryant Park"]);
    expect(names(out)).not.toContain("Staten Island");
  });
  it("handles fewer restrooms than the limit", () => {
    expect(nearestRestrooms({ type: "FeatureCollection", features: all.features.slice(0, 2) }, [-74, 40.7]).features).toHaveLength(2);
  });
});

describe("restroomsForView", () => {
  const center: [number, number] = [-73.99, 40.74];
  // About 22 m apart, all well inside the street radius.
  const block: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: Array.from({ length: 8 }, (_, i) => pt(`b${i}`, center[0], center[1] + i * 0.0002)),
  };
  it("keeps the closest few below street zoom", () => {
    const out = restroomsForView(block, center, 16);
    expect(out.features).toHaveLength(NEAREST_COUNT);
    expect(names(out)).toEqual(["b0", "b1", "b2", "b3", "b4"]);
  });
  it("keeps the block in front of you at street zoom", () => {
    const out = restroomsForView(block, center, 17);
    expect(names(out)).toEqual(["b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7"]);
  });
  it("drops restrooms past the street radius and caps the rest", () => {
    const crowded: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        ...Array.from({ length: 30 }, (_, i) => pt(`n${i}`, center[0], center[1] + i * 0.00008)),
        pt("far", center[0], center[1] + 0.01),
      ],
    };
    const out = restroomsForView(crowded, center, 18);
    expect(out.features).toHaveLength(STREET_CAP);
    expect(names(out)[0]).toBe("n0");
    expect(names(out)).not.toContain("far");
  });
});
