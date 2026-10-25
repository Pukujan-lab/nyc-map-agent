import { describe, expect, it } from "vitest";
import { restroomInfo, closestRestroom } from "./layers";
import { restroomRows, restroomSourceLine } from "./source";

const pt = (lon: number, lat: number, properties: Record<string, unknown>): GeoJSON.Feature => ({ type: "Feature", properties, geometry: { type: "Point", coordinates: [lon, lat] } });

describe("restroom source on the card", () => {
  it("names OpenStreetMap and its edit date for an OSM-only place", () => {
    const info = restroomInfo(pt(-73.9, 40.7, { name: "Public toilet", source: "openstreetmap", asOf: "2026-10-03T12:15:14.000Z", fee: false, unisex: true }))!;
    expect(restroomSourceLine(info)).toBe("OpenStreetMap, updated Oct 3, 2026");
    expect(restroomRows(info).filter(([, v]) => v)).toEqual([["Fee", "Free"], ["Unisex", "Yes"]]);
  });
  it("names the city list and notes OSM-filled details, even from a rendered feature's JSON-text array", () => {
    const info = restroomInfo(pt(-73.9, 40.7, { name: "A", source: "nyc-open-data", asOf: "2025-06-27T13:37:17.684Z", filledFromOsm: '["hours"]' }))!;
    expect(restroomSourceLine(info)).toBe("NYC Open Data · Public Restrooms, updated Jun 27, 2025 · some details from OpenStreetMap");
    expect(restroomSourceLine({})).toBe("NYC Open Data · Public Restrooms");
  });
  it("finds the nearest restroom across both sources", () => {
    const all: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [pt(-73.99, 40.75, { name: "City", source: "nyc-open-data" }), pt(-73.9801, 40.7401, { name: "OSM", source: "openstreetmap" })],
    };
    expect(closestRestroom(all, [-73.98, 40.74])?.info).toMatchObject({ name: "OSM", source: "openstreetmap" });
  });
});
