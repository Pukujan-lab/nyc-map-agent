import { describe, expect, it } from "vitest";
import { atlasCell, FACADE_CATEGORIES, facadeCategory } from "./storefrontCategory";

describe("storefront facades", () => {
  it("maps OSM tags to the ten categories", () => {
    expect(facadeCategory("restaurant", "food")).toBe("restaurant");
    expect(facadeCategory("cafe", "food")).toBe("cafe");
    expect(facadeCategory("convenience", "shop")).toBe("deli");
    expect(facadeCategory("pharmacy", "health")).toBe("pharmacy");
    expect(facadeCategory("bank", "money")).toBe("bank");
    expect(facadeCategory("clothes", "shop")).toBe("clothing");
    expect(facadeCategory("supermarket", "shop")).toBe("supermarket");
    expect(facadeCategory("department_store", "shop")).toBe("mall");
    expect(facadeCategory("pub", "food")).toBe("bar");
    expect(facadeCategory("hardware", "shop")).toBe("generic");
    expect(facadeCategory(undefined, "mall")).toBe("mall");
  });
  it("has one atlas cell per category", () => {
    expect(FACADE_CATEGORIES).toHaveLength(10);
    expect(atlasCell("restaurant")).toEqual([0, 0]);
    expect(atlasCell("generic")).toEqual([4, 1]);
  });
});
