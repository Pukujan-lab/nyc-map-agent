import { describe, expect, it } from "vitest";
import { NEAREST_COUNT, nearestRestrooms } from "./layers";

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
