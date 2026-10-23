import { describe, expect, it } from "vitest";
import { NEAREST_COUNT, STREET_CAP, closestRestroom, formatMetres, nearestRestrooms, restroomAnchor, restroomsForView, spreadRestrooms } from "./layers";

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
  it("ignores a wide view at street zoom and still drops the far restroom", () => {
    const crowded: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        pt("near", center[0], center[1]),
        pt("far", center[0], center[1] + 0.01),
      ],
    };
    const out = restroomsForView(crowded, center, 17, { west: -180, south: -90, east: 180, north: 90 });
    expect(names(out)).toEqual(["near"]);
  });
});

describe("spreadRestrooms", () => {
  it("samples both edges of a crowded view", () => {
    const features: GeoJSON.Feature[] = [];
    for (let x = 0; x < 9; x += 1) {
      for (let y = 0; y < 9; y += 1) features.push(pt(`p${x}-${y}`, -74.05 + x * 0.015, 40.7 + y * 0.01));
    }
    const out = spreadRestrooms(
      { type: "FeatureCollection", features },
      { west: -74.05, south: 40.7, east: -73.93, north: 40.78 },
      [-73.99, 40.74],
      9,
    );
    expect(out.features).toHaveLength(9);
    const lons = out.features.map((f) => (f.geometry as GeoJSON.Point).coordinates[0]);
    const lats = out.features.map((f) => (f.geometry as GeoJSON.Point).coordinates[1]);
    expect(Math.min(...lons)).toBeLessThan(-74.02);
    expect(Math.max(...lons)).toBeGreaterThan(-73.96);
    expect(Math.max(...lats) - Math.min(...lats)).toBeGreaterThan(0.04);
  });
});

describe("closestRestroom", () => {
  it("returns the nearest point and a walking distance", () => {
    const hit = closestRestroom(
      { type: "FeatureCollection", features: [pt("Far", -73.8, 40.72), pt("Near", -73.99, 40.74)] },
      [-73.99, 40.7401],
    );
    expect(hit?.info.name).toBe("Near");
    expect(hit?.info.lon).toBeCloseTo(-73.99);
    expect(hit?.info.lat).toBeCloseTo(40.74);
    expect(hit!.metres).toBeGreaterThan(0);
    expect(hit!.metres).toBeLessThan(30);
  });
});

describe("restroomAnchor", () => {
  it("sits above bus badges and just under the vehicle layer", () => {
    expect(restroomAnchor(["bus", "restrooms"])).toBe("stay");
    expect(restroomAnchor(["restrooms", "bus"])).toBe("top");
    expect(restroomAnchor(["restrooms", "three-vehicles"])).toBe("stay");
    expect(restroomAnchor(["restrooms", "bus", "three-vehicles"])).toBe("before-vehicles");
    expect(restroomAnchor(["bus"])).toBe("stay");
  });
});

describe("formatMetres", () => {
  it("rounds short walks to tens of metres and longer ones to kilometres", () => {
    expect(formatMetres(12)).toBe("10 m");
    expect(formatMetres(104)).toBe("100 m");
    expect(formatMetres(1500)).toBe("1.5 km");
    expect(formatMetres(12000)).toBe("12 km");
  });
});
