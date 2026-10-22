import { describe, expect, it } from "vitest";
import { fromOsm } from "./normalize";
import { collectPlaceToilets } from "./ingest";

const el = (tags: Record<string, string>, extra: object = { lat: 40.73, lon: -73.99 }) => ({ type: "node" as const, id: 1, tags, ...extra });

describe("fromOsm", () => {
  it("labels yes/permissive/public as anyone and customers or untagged as customers", () => {
    expect(fromOsm(el({ toilets: "yes", amenity: "cafe", name: "A", "toilets:access": "permissive" }))?.access).toBe("anyone");
    expect(fromOsm(el({ toilets: "yes", amenity: "cafe", name: "A", "toilets:access": "yes" }))?.access).toBe("anyone");
    expect(fromOsm(el({ toilets: "yes", amenity: "pub", name: "A", "toilets:access": "customers" }))?.access).toBe("customers");
    const untagged = fromOsm(el({ toilets: "yes", shop: "books", name: "A" }));
    expect(untagged).toMatchObject({ access: "customers", accessTagged: false, kind: "shop" });
  });
  it("drops private toilets, other amenities and places without a name", () => {
    expect(fromOsm(el({ toilets: "yes", amenity: "cafe", name: "A", "toilets:access": "private" }))).toBeNull();
    expect(fromOsm(el({ toilets: "yes", amenity: "bank", name: "A" }))).toBeNull();
    expect(fromOsm(el({ toilets: "no", amenity: "cafe", name: "A" }))).toBeNull();
    expect(fromOsm(el({ toilets: "yes", amenity: "cafe" }))).toBeNull();
  });
  it("reads wheelchair, changing table, fee and a way's center", () => {
    const p = fromOsm({ type: "way", id: 7, center: { lat: 40.7, lon: -74 }, tags: { toilets: "yes", amenity: "fast_food", name: "B", "toilets:wheelchair": "yes", changing_table: "yes", "toilets:fee": "no" } });
    expect(p).toMatchObject({ id: "osm:way/7", wheelchair: true, changingTable: true, fee: false, lon: -74, url: "https://www.openstreetmap.org/way/7" });
  });
});

describe("collectPlaceToilets", () => {
  it("parses an Overpass response and dedupes", async () => {
    const body = { elements: [el({ toilets: "yes", amenity: "cafe", name: "A" }), el({ toilets: "yes", amenity: "cafe", name: "A" })] };
    const { places, elements } = await collectPlaceToilets(() => Promise.resolve(body));
    expect(elements).toBe(2);
    expect(places).toHaveLength(1);
  });
});
