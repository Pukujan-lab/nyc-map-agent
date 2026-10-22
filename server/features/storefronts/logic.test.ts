import { describe, expect, it } from "vitest";
import { brandsQuery, licenseOk, logoFile, matchBrand, normName, snapBbox, QID } from "./logic";

describe("storefront brands", () => {
  it("asks Overpass for brand-tagged shops and amenities in the bbox", () => {
    const q = brandsQuery({ west: -74, south: 40.72, east: -73.99, north: 40.73 });
    expect(q).toContain('nwr["brand:wikidata"]["shop"](40.72,-74,40.73,-73.99)');
    expect(q).toContain("out center tags");
  });
  it("snaps bboxes to a shared grid", () => {
    expect(snapBbox({ west: -74.0012, south: 40.7213, east: -73.9987, north: 40.7244 })).toEqual({ west: -74.005, south: 40.72, east: -73.995, north: 40.725 });
  });
  it("only re-hosts free Commons licenses", () => {
    expect(licenseOk("Public domain")).toBe(true);
    expect(licenseOk("CC BY-SA 4.0")).toBe(true);
    expect(licenseOk("CC0")).toBe(true);
    expect(licenseOk("CC BY-NC 2.0")).toBe(false);
    expect(licenseOk(undefined)).toBe(false);
  });
  it("reads P154 from a Wikidata entity", () => {
    const e = { entities: { Q37158: { claims: { P154: [{ mainsnak: { datavalue: { value: "Starbucks Logo.svg" } } }] } } } };
    expect(logoFile(e, "Q37158")).toBe("Starbucks Logo.svg");
    expect(logoFile({}, "Q1")).toBeNull();
    expect(QID.test("Q37158")).toBe(true);
    expect(QID.test("Q0; drop")).toBe(false);
  });
  it("matches names loosely", () => {
    expect(normName("Dunkin'")).toBe(normName("dunkin"));
    expect(normName("Barnes & Noble")).toBe("barnesandnoble");
  });
});

describe("sign → brand", () => {
  const brands = [{ name: "Starbucks", brand: "Starbucks", qid: "Q37158", lon: -74.0005, lat: 40.7235 }];
  it("matches the same name nearby", () => expect(matchBrand({ name: "STARBUCKS", lon: -74.0, lat: 40.7235 }, brands)).toBe("Q37158"));
  it("ignores far or different shops", () => {
    expect(matchBrand({ name: "Starbucks", lon: -73.99, lat: 40.7235 }, brands)).toBeNull();
    expect(matchBrand({ name: "Joe's Pizza", lon: -74.0, lat: 40.7235 }, brands)).toBeNull();
  });
});
