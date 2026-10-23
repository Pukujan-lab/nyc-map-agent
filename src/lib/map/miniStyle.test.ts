import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { coneRotation, facingLabel, keepInMini, miniStyle } from "./miniStyle";

describe("street mini map", () => {
  it("keeps land, water, streets and subway; drops labels and 3D", () => {
    expect(keepInMini({ id: "background", type: "background" })).toBe(true);
    expect(keepInMini({ id: "water", type: "fill", "source-layer": "water" })).toBe(true);
    expect(keepInMini({ id: "road_minor", type: "line", "source-layer": "transportation" })).toBe(true);
    expect(keepInMini({ id: "transit-station", type: "circle" })).toBe(true);
    expect(keepInMini({ id: "transit-station-raised", type: "circle" })).toBe(true);
    expect(keepInMini({ id: "label_other", type: "symbol" })).toBe(false);
    expect(keepInMini({ id: "building-3d", type: "fill-extrusion", "source-layer": "building" })).toBe(false);
    expect(keepInMini({ id: "building", type: "fill", "source-layer": "building" })).toBe(true);
    expect(keepInMini({ id: "tunnel_road", type: "line", "source-layer": "transportation" })).toBe(false);
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
  it("keeps a raised station dot and sits it on the station", () => {
    const s = miniStyle({
      version: 8,
      sources: { a: { type: "geojson", data: { type: "FeatureCollection", features: [] } } },
      layers: [{ id: "transit-station-raised", type: "circle", source: "a", paint: { "circle-translate": [0, -26], "circle-radius": 3 } }],
    } as StyleSpecification);
    const layer = s.layers[0];
    expect(layer.id).toBe("transit-station-raised");
    expect(layer.type === "circle" && layer.paint?.["circle-translate"]).toEqual([0, 0]);
  });
  it("turns the cone with the camera yaw", () => {
    expect(coneRotation(90)).toBe(90);
    expect(coneRotation(-90)).toBe(270);
  });
  it("names eight compass facings", () => {
    expect(facingLabel(0)).toBe("Facing north");
    expect(facingLabel(45)).toBe("Facing northeast");
    expect(facingLabel(180)).toBe("Facing south");
    expect(facingLabel(-90)).toBe("Facing west");
  });
  it("keeps footprints, drops pattern images, and copies the sprite", () => {
    const s = miniStyle({
      version: 8,
      sprite: "https://example/sprite",
      glyphs: "https://example/glyphs/{fontstack}/{range}.pbf",
      sources: { a: { type: "geojson", data: { type: "FeatureCollection", features: [] } } },
      layers: [
        {
          id: "road_minor_casing",
          type: "line",
          source: "a",
          "source-layer": "transportation",
          minzoom: 14,
          maxzoom: 16,
          paint: { "line-pattern": "street-concrete", "line-width": 8, "line-opacity": 0 },
        },
        {
          id: "park",
          type: "fill",
          source: "a",
          "source-layer": "park",
          paint: { "fill-pattern": "grass", "fill-color": "#9c9" },
        },
      ],
    } as StyleSpecification);
    expect(s.sprite).toBe("https://example/sprite");
    expect(s.glyphs).toContain("glyphs");
    const line = s.layers[0];
    expect(line.minzoom).toBeUndefined();
    expect(line.maxzoom).toBeUndefined();
    expect(line.type === "line" && line.paint?.["line-pattern"]).toBeUndefined();
    expect(line.type === "line" && line.paint?.["line-width"]).toBe(4);
    expect(line.type === "line" && line.paint?.["line-opacity"]).toBeUndefined();
    const park = s.layers[1];
    expect(park.type === "fill" && park.paint?.["fill-pattern"]).toBeUndefined();
    expect(park.type === "fill" && park.paint?.["fill-color"]).toBe("#9c9");
  });
});
