import { beforeEach, describe, expect, it, vi } from "vitest";

const octoQuery = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>();
vi.mock("../../../api/_lib/octo", () => ({ octoQuery: (sql: string, params: unknown[]) => octoQuery(sql, params), OctoError: class extends Error {} }));

const { GET } = await import("./routes");
const { RestroomsResponse } = await import("./schema");

const cityRow = {
  name: "Battery Park Zone 1",
  status: "Not Operational",
  hours: null,
  accessibility: null,
  operator: "NYC Parks",
  location_type: "Park",
  changing_stations: "Yes",
  updated_at: "2025-06-27 13:37:17.684+00",
  lat: "40.704410",
  lon: "-74.015900",
};
const osmRows = [
  // About 10 m from the city restroom: the same place.
  { id: "osm:node/1", name: null, access: "yes", fee: false, wheelchair: "yes", opening_hours: "24/7", changing_table: null, unisex: null, operator: null, url: "https://www.openstreetmap.org/node/1", edited_at: "2026-10-03T12:15:14Z", lon: -74.0159, lat: 40.7045 },
  { id: "osm:way/2", name: "Pier 25 toilets", access: null, fee: null, wheelchair: null, opening_hours: null, changing_table: true, unisex: true, operator: null, url: "https://www.openstreetmap.org/way/2", edited_at: "2026-09-01T00:00:00Z", lon: -74.0145, lat: 40.7205 },
];

beforeEach(() => {
  octoQuery.mockReset();
  octoQuery.mockImplementation((sql) => Promise.resolve({ rows: sql.includes("core.osm_toilets") ? osmRows : [cityRow] }));
});

describe("GET /api/restrooms", () => {
  it("merges the city list with OSM toilets, each record carrying its source and asOf", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = RestroomsResponse.parse(await res.json());
    expect(body.features.map((f) => [f.properties.source, f.properties.asOf])).toEqual([
      ["nyc-open-data", "2025-06-27T13:37:17.684Z"],
      ["openstreetmap", "2026-09-01T00:00:00.000Z"],
    ]);
    expect(body.features[0].properties).toMatchObject({ hours: "24/7", accessibility: "Fully Accessible", changingTable: true, osmId: "osm:node/1" });
    expect(body.features[0].geometry.coordinates).toEqual([-74.0159, 40.70441]);
  });
  it("serves the city list alone when the OSM table cannot be read", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    octoQuery.mockImplementation((sql) => (sql.includes("core.osm_toilets") ? Promise.reject(new Error("relation does not exist")) : Promise.resolve({ rows: [cityRow] })));
    const body = RestroomsResponse.parse(await (await GET()).json());
    expect(body.features).toHaveLength(1);
    expect(body.features[0].properties.source).toBe("nyc-open-data");
    err.mockRestore();
  });
});
