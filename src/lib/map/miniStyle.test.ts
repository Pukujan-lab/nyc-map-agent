import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { coneRotation, facingLabel, insetFilters, keepInMini, miniStyle, pointLayerOn } from "./miniStyle";

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

  it("draws a filter's points only while that filter is on, and keeps transit either way", () => {
    const on = insetFilters({
      placeClasses: ["cafe", "toilets"],
      busStops: true,
      restrooms: true,
      shops: true,
      parking: true,
      events: true,
      ferry: true,
      schools: true,
    });
    const off = insetFilters({
      placeClasses: [],
      busStops: false,
      restrooms: false,
      shops: true,
      parking: false,
      events: false,
      ferry: false,
      schools: false,
    });
    const layers = [
      { id: "background", type: "background" },
      { id: "transit-line", type: "line", source: "transit" },
      { id: "transit-station", type: "circle", source: "transit" },
      { id: "restrooms", type: "symbol", source: "restrooms", minzoom: 14, layout: { visibility: "none", "icon-image": "restroom-icon" } },
      { id: "poi_r1", type: "symbol", source: "openmaptiles", "source-layer": "poi", minzoom: 16 },
      { id: "poi_transit", type: "symbol", source: "openmaptiles", "source-layer": "poi" },
      { id: "parking-icons", type: "symbol", source: "parking", maxzoom: 17 },
      { id: "parking-signs", type: "symbol", source: "parking", minzoom: 17 },
      { id: "events-pin", type: "circle", source: "events-pins" },
      { id: "events-line", type: "line", source: "events-lines" },
      { id: "place-toilets", type: "circle", source: "place-toilets", layout: { visibility: "none" } },
      { id: "ferry-terminals", type: "circle", source: "ferry-terminals-src" },
      { id: "ferry-vessels", type: "circle", source: "ferry-vessels-src" },
      { id: "city3d-schools", type: "symbol", source: "city3d" },
      { id: "traffic-speeds", type: "line", source: "traffic" },
      { id: "label_other", type: "symbol", source: "openmaptiles" },
    ];
    const style = {
      version: 8,
      sprite: "https://example/sprite",
      glyphs: "https://example/{font}",
      sources: {
        transit: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        restrooms: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        openmaptiles: { type: "vector", url: "https://example/tiles" },
        parking: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        "events-pins": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        "events-lines": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        "place-toilets": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        "ferry-terminals-src": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        "ferry-vessels-src": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        city3d: { type: "vector", url: "pmtiles://city" },
        traffic: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      },
      layers,
    } as StyleSpecification;

    // The inset draws its own mini-restrooms layer, so the main one is never copied.
    expect(pointLayerOn("restrooms", on)).toBe(false);
    expect(pointLayerOn("poi_r1", on)).toBe(true);
    expect(pointLayerOn("parking-signs", on)).toBe(false);
    expect(pointLayerOn("place-toilets", off)).toBe(false);
    expect(keepInMini({ id: "restrooms", type: "symbol" })).toBe(false);

    const shown = miniStyle(style, on);
    expect(shown.sprite).toBe("https://example/sprite");
    expect(shown.layers.map((l) => l.id)).toEqual([
      "background",
      "transit-line",
      "transit-station",
      "poi_r1",
      "poi_transit",
      "parking-icons",
      "events-pin",
      "place-toilets",
      "ferry-terminals",
      "ferry-vessels",
      "city3d-schools",
    ]);
    const parking = shown.layers.find((l) => l.id === "parking-icons");
    const places = shown.layers.find((l) => l.id === "poi_r1");
    expect(shown.layers.some((l) => l.id === "restrooms")).toBe(false);
    expect(parking?.maxzoom).toBe(17);
    expect(places?.minzoom).toBeUndefined();
    expect(Object.keys(shown.sources)).not.toContain("traffic");
    expect(Object.keys(shown.sources)).not.toContain("events-lines");

    const hidden = miniStyle(style, off);
    expect(hidden.layers.map((l) => l.id)).toEqual(["background", "transit-line", "transit-station"]);
  });

  it("leaves sprite and glyphs out when the main style has none (maplibre rejects undefined)", () => {
    const s = miniStyle({ version: 8, sources: {}, layers: [{ id: "background", type: "background" }] } as StyleSpecification);
    expect("glyphs" in s).toBe(false);
    expect("sprite" in s).toBe(false);
  });
});
