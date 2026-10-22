import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { coneRotation, keepInMini, miniStyle } from "./miniStyle";

describe("street mini map", () => {
  it("keeps land, water, streets and subway; drops labels and 3D", () => {
    expect(keepInMini({ id: "background", type: "background" })).toBe(true);
    expect(keepInMini({ id: "water", type: "fill", "source-layer": "water" })).toBe(true);
    expect(keepInMini({ id: "road_minor", type: "line", "source-layer": "transportation" })).toBe(true);
    expect(keepInMini({ id: "transit-station", type: "circle" })).toBe(true);
    expect(keepInMini({ id: "label_other", type: "symbol" })).toBe(false);
    expect(keepInMini({ id: "building-3d", type: "fill-extrusion", "source-layer": "building" })).toBe(false);
  });
  it("only carries the sources its layers use", () => {
    const s = miniStyle({
      version: 8,
      sources: { a: { type: "geojson", data: { type: "FeatureCollection", features: [] } }, b: { type: "geojson", data: { type: "FeatureCollection", features: [] } } },
      layers: [{ id: "transit-line", type: "line", source: "a" }, { id: "x", type: "symbol", source: "b" }],
    } as StyleSpecification);
    expect(Object.keys(s.sources)).toEqual(["a"]);
    expect(s.layers.map((l) => l.id)).toEqual(["transit-line"]);
  });
  it("turns the cone with the camera yaw", () => {
    expect(coneRotation(90)).toBe(90);
    expect(coneRotation(-90)).toBe(270);
  });
});
