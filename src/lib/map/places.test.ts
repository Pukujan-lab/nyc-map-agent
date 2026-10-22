import { describe, expect, it } from "vitest";
import { PLACE_CATEGORIES, POI_LAYERS, classesFor, readPlaces } from "./places";

describe("places", () => {
  it("are hidden until a category is chosen", () => {
    expect(readPlaces({ getItem: () => null }).size).toBe(0);
    expect([...readPlaces({ getItem: () => JSON.stringify(["coffee.cafe", "bogus"]) })]).toEqual(["coffee.cafe"]);
    expect(readPlaces({ getItem: () => "not json" }).size).toBe(0);
  });
  it("maps subcategories to basemap classes", () => {
    expect(classesFor(new Set(["coffee.cafe", "food.bar"]))).toEqual(["bar", "beer", "cafe"]);
    expect(classesFor(new Set())).toEqual([]);
  });
  it("offers the requested categories plus Health and Citi Bike", () => {
    expect(PLACE_CATEGORIES.map((c) => c.label)).toEqual(["Food", "Coffee", "Things to do", "Shopping", "Parks", "Health", "Citi Bike", "Restrooms"]);
  });
  it("targets only the basemap place-icon layers", () => {
    expect(["poi_r1", "poi_r7", "poi_r20"].every((id) => POI_LAYERS.test(id))).toBe(true);
    expect(POI_LAYERS.test("poi_transit")).toBe(false);
  });
});
