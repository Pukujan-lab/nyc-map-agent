import { describe, expect, it } from "vitest";
import { matchSamePlaces, mergeRestrooms, metresBetween, SAME_PLACE_M, type CityRestroom } from "./merge";
import type { OsmToilet } from "./osm";

const city = (name: string, lon: number, lat: number, over: Partial<CityRestroom> = {}): CityRestroom => ({
  name,
  status: "Operational",
  hours: null,
  accessibility: null,
  operator: "NYC Parks",
  location_type: "Park",
  changing_stations: null,
  updated_at: "2025-06-27T13:37:17.684Z",
  lon,
  lat,
  ...over,
});
const osm = (id: string, lon: number, lat: number, over: Partial<OsmToilet> = {}): OsmToilet => ({
  id,
  name: null,
  access: "yes",
  fee: false,
  wheelchair: "yes",
  openingHours: "24/7",
  changingTable: true,
  unisex: true,
  operator: "Other operator",
  url: `https://www.openstreetmap.org/${id.slice(4)}`,
  editedAt: "2026-10-03T12:15:14.000Z",
  lon,
  lat,
  ...over,
});

/** A point `m` metres north of (lon, lat). */
const north = (lon: number, lat: number, m: number): [number, number] => [lon, lat + m / 110_540];

describe("matchSamePlaces", () => {
  it("matches within 40 m and not beyond", () => {
    const near = north(-73.97, 40.77, 30);
    const far = north(-73.97, 40.77, 55);
    expect(metresBetween([-73.97, 40.77], near)).toBeLessThan(SAME_PLACE_M);
    const m = matchSamePlaces([{ lon: -73.97, lat: 40.77 }], [{ lon: far[0], lat: far[1] }, { lon: near[0], lat: near[1] }]);
    expect([...m]).toEqual([[0, 1]]);
  });
  it("pairs each toilet with one restroom, closest pair first", () => {
    const a = { lon: -73.97, lat: 40.77 };
    const [, bLat] = north(a.lon, a.lat, 20);
    const [, tLat] = north(a.lon, a.lat, 15);
    // The toilet is 15 m from a and 5 m from b: b claims it, a stays unmatched.
    const m = matchSamePlaces([a, { lon: a.lon, lat: bLat }], [{ lon: a.lon, lat: tLat }]);
    expect([...m]).toEqual([[1, 0]]);
  });
});

describe("mergeRestrooms", () => {
  it("keeps city fields, fills gaps from the matched OSM toilet and adds OSM-only places", () => {
    const [lon, lat] = north(-73.97, 40.77, 25);
    const out = mergeRestrooms(
      [city("Central Park Zone 1", -73.97, 40.77, { hours: "8am-8pm" }), city("Far Park", -73.8, 40.6)],
      [osm("osm:node/1", lon, lat), osm("osm:way/2", -73.9, 40.7, { name: "Pier toilet", wheelchair: "limited" })],
    );
    expect(out.features).toHaveLength(3);
    const merged = out.features[0].properties;
    expect(merged).toMatchObject({
      name: "Central Park Zone 1",
      source: "nyc-open-data",
      asOf: "2025-06-27T13:37:17.684Z",
      hours: "8am-8pm",
      operator: "NYC Parks",
      accessibility: "Fully Accessible",
      fee: false,
      changingTable: true,
      unisex: true,
      osmId: "osm:node/1",
    });
    expect(merged.filledFromOsm).toEqual(["accessibility", "fee", "changingTable", "unisex"]);
    expect(out.features[0].geometry.coordinates).toEqual([-73.97, 40.77]);
    expect(out.features[1].properties).toMatchObject({ name: "Far Park", osmId: null, filledFromOsm: [], fee: null });
    expect(out.features[2]).toMatchObject({
      id: "osm:way/2",
      geometry: { coordinates: [-73.9, 40.7] },
      properties: { source: "openstreetmap", name: "Pier toilet", asOf: "2026-10-03T12:15:14.000Z", accessibility: "Partially Accessible", hours: "24/7", status: null },
    });
    expect(out.sources).toEqual([
      { id: "nyc-open-data", asOf: "2025-06-27T13:37:17.684Z", count: 2 },
      { id: "openstreetmap", asOf: "2026-10-03T12:15:14.000Z", count: 1 },
    ]);
  });
  it("prefers the city's changing-station answer and names an unnamed OSM toilet", () => {
    const out = mergeRestrooms([city("A", -73.97, 40.77, { changing_stations: "No" })], [osm("osm:node/1", -73.97, 40.77), osm("osm:node/3", -73.5, 40.5)]);
    expect(out.features[0].properties.changingTable).toBe(false);
    expect(out.features[1].properties.name).toBe("Public toilet");
  });
  it("serves the city list alone when there is no OSM data", () => {
    const out = mergeRestrooms([city("A", -73.97, 40.77)], []);
    expect(out.features.map((f) => f.properties.source)).toEqual(["nyc-open-data"]);
    expect(out.sources[1]).toEqual({ id: "openstreetmap", asOf: null, count: 0 });
  });
});
