import { describe, expect, it } from "vitest";
import { classify, osmHeight, wantsWaterTower } from "./build-city-tiles";

describe("classify", () => {
  it("maps PLUTO classes and heights to facades", () => {
    expect(classify({ bldgclass: "B1", floors: 3, heightM: 11, year: 1925 })).toEqual({ facade: "rowhouse", storefront: false });
    expect(classify({ bldgclass: "B1", floors: 3, heightM: 11, year: 1899 }).facade).toBe("brownstone");
    expect(classify({ bldgclass: "O4", floors: 70, heightM: 300, year: 2015 }).facade).toBe("glass");
    expect(classify({ bldgclass: "O4", floors: 30, heightM: 110, year: 1930 }).facade).toBe("limestone");
    expect(classify({ bldgclass: "K1", floors: 5, heightM: 22, year: 1875, lon: -74.002, lat: 40.722 }).facade).toBe("castiron");
    expect(classify({ bldgclass: "K1", floors: 5, heightM: 22, year: 1875, lon: -73.95, lat: 40.78 }).facade).toBe("walkup");
    expect(classify({ bldgclass: "C7", floors: 5, heightM: 17, year: 1910 })).toEqual({ facade: "walkup", storefront: true });
    expect(classify({ bldgclass: "D4", floors: 12, heightM: 40, year: 1928 }).facade).toBe("prewar");
    expect(classify({ bldgclass: "D4", floors: 12, heightM: 40, year: 1985 }).facade).toBe("modern");
    expect(classify({ bldgclass: "O4", floors: 25, heightM: 90, year: 1972 }).facade).toBe("tower");
    expect(classify({ bldgclass: "W1", floors: 4, heightM: 18, year: 1930 }).facade).toBe("school");
    expect(classify({ bldgclass: "D4", floors: 5, heightM: 20, school: true }).facade).toBe("school");
  });
});

describe("osmHeight / wantsWaterTower", () => {
  it("parses OSM heights", () => {
    expect(osmHeight("120")).toBe(120);
    expect(osmHeight("12.5 m")).toBe(12.5);
    expect(osmHeight("100'")).toBeCloseTo(30.48);
    expect(osmHeight("tall")).toBeUndefined();
  });
  it("puts tanks on some prewar mid-rises only", () => {
    expect(wantsWaterTower({ facade: "prewar", floors: 12, year: 1925, i: 3 })).toBe(true);
    expect(wantsWaterTower({ facade: "prewar", floors: 12, year: 1925, i: 4 })).toBe(false);
    expect(wantsWaterTower({ facade: "glass", floors: 12, year: 1925, i: 3 })).toBe(false);
    expect(wantsWaterTower({ facade: "walkup", floors: 4, year: 1925, i: 3 })).toBe(false);
  });
});
