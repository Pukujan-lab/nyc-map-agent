import { describe, expect, it } from "vitest";
import { classify } from "./build-city-tiles";

describe("classify", () => {
  it("maps PLUTO classes and heights to facades", () => {
    expect(classify({ bldgclass: "B1", floors: 3, heightM: 11, year: 1899 })).toEqual({ facade: "rowhouse", storefront: false });
    expect(classify({ bldgclass: "C7", floors: 5, heightM: 17, year: 1910 })).toEqual({ facade: "walkup", storefront: true });
    expect(classify({ bldgclass: "D4", floors: 12, heightM: 40, year: 1928 }).facade).toBe("prewar");
    expect(classify({ bldgclass: "D4", floors: 12, heightM: 40, year: 1985 }).facade).toBe("modern");
    expect(classify({ bldgclass: "O4", floors: 40, heightM: 160, year: 1972 }).facade).toBe("tower");
  });
});
