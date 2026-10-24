import { describe, expect, it, vi } from "vitest";
import { collectOsmToilets, fromOsmToilet, OVERPASS_QUERY, replaceOsmToilets, type OsmToilet } from "./osm";

const el = (tags: Record<string, string>, extra: object = { lat: 40.77, lon: -73.97 }) => ({ type: "node" as const, id: 1, tags, ...extra });

describe("fromOsmToilet", () => {
  it("normalises access, fee, wheelchair, opening_hours, changing_table, unisex and the edit time", () => {
    const t = fromOsmToilet({
      type: "node",
      id: 322546340,
      lat: 40.7735,
      lon: -73.9712,
      timestamp: "2026-10-03T12:15:14Z",
      tags: { amenity: "toilets", access: "yes", fee: "no", wheelchair: "limited", opening_hours: "06:00-22:00", changing_table: "yes", unisex: "yes", operator: "NYC Parks", name: "Comfort station" },
    });
    expect(t).toEqual({
      id: "osm:node/322546340",
      name: "Comfort station",
      access: "yes",
      fee: false,
      wheelchair: "limited",
      openingHours: "06:00-22:00",
      changingTable: true,
      unisex: true,
      operator: "NYC Parks",
      url: "https://www.openstreetmap.org/node/322546340",
      editedAt: "2026-10-03T12:15:14Z",
      lon: -73.9712,
      lat: 40.7735,
    });
  });
  it("keeps untagged and permissive access, and reads a way's center and gender_segregated=no", () => {
    expect(fromOsmToilet(el({ amenity: "toilets" }))).toMatchObject({ access: null, name: null, fee: null, unisex: null });
    expect(fromOsmToilet(el({ amenity: "toilets", access: "permissive" }))?.access).toBe("permissive");
    const way = fromOsmToilet({ type: "way", id: 7, center: { lat: 40.7, lon: -74 }, tags: { amenity: "toilets", gender_segregated: "no" } });
    expect(way).toMatchObject({ id: "osm:way/7", lon: -74, lat: 40.7, unisex: true, url: "https://www.openstreetmap.org/way/7" });
  });
  it("drops private, no and customers-only toilets, other amenities and elements without a position", () => {
    expect(fromOsmToilet(el({ amenity: "toilets", access: "private" }))).toBeNull();
    expect(fromOsmToilet(el({ amenity: "toilets", access: "no" }))).toBeNull();
    expect(fromOsmToilet(el({ amenity: "toilets", access: "customers" }))).toBeNull();
    expect(fromOsmToilet(el({ amenity: "cafe", toilets: "yes" }))).toBeNull();
    expect(fromOsmToilet(el({ amenity: "toilets" }, {}))).toBeNull();
  });
});

describe("collectOsmToilets", () => {
  it("posts the NYC amenity=toilets query, parses the response and dedupes by element", async () => {
    const post = vi.fn<(url: string, body: URLSearchParams) => Promise<unknown>>(() =>
      Promise.resolve({ elements: [el({ amenity: "toilets" }), el({ amenity: "toilets" }), el({ amenity: "toilets", access: "private" }, { id: 2, lat: 40.7, lon: -74 })] }),
    );
    const { toilets, elements } = await collectOsmToilets(post);
    expect(post.mock.calls[0][1].get("data")).toBe(OVERPASS_QUERY);
    expect(OVERPASS_QUERY).toContain('nwr["amenity"="toilets"](area.nyc)');
    expect(elements).toBe(3);
    expect(toilets.map((t) => t.id)).toEqual(["osm:node/1"]);
  });
  it("rejects a malformed Overpass payload", async () => {
    await expect(collectOsmToilets(() => Promise.resolve({ remark: "runtime error" }))).rejects.toThrow();
  });
});

describe("replaceOsmToilets", () => {
  it("refuses an empty result and leaves the table alone", async () => {
    const query = vi.fn(() => Promise.resolve());
    await expect(replaceOsmToilets([], query)).rejects.toThrow(/keeping the previous table/);
    expect(query).not.toHaveBeenCalled();
  });
  it("deletes then inserts in one jsonb batch", async () => {
    const query = vi.fn<(sql: string, params?: unknown[]) => Promise<void>>(() => Promise.resolve());
    const t = fromOsmToilet(el({ amenity: "toilets" })) as OsmToilet;
    await replaceOsmToilets([t], query);
    expect(query.mock.calls[0][0]).toBe("DELETE FROM core.osm_toilets");
    expect(query.mock.calls[1][0]).toContain("INSERT INTO core.osm_toilets");
    expect(JSON.parse((query.mock.calls[1][1] as string[])[0])).toEqual([t]);
  });
});
