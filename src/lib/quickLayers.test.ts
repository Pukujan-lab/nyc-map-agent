import { describe, expect, it } from "vitest";
import { getQuickLayer, setQuickLayer } from "./quickLayers";

describe("quick layers store", () => {
  it("defaults businesses and x-ray off, street art on", () => {
    expect(getQuickLayer("businesses")).toBe(false);
    expect(getQuickLayer("streetArt")).toBe(true);
    expect(getQuickLayer("xray")).toBe(false);
  });
  it("toggles", () => {
    setQuickLayer("xray", true);
    expect(getQuickLayer("xray")).toBe(true);
  });
});

import { withBusinesses } from "@/lib/map/places";
describe("withBusinesses", () => {
  it("off strips business places, keeps others", () => {
    expect([...withBusinesses(new Set(["food.restaurant", "parks.park"]), false)]).toEqual(["parks.park"]);
  });
  it("on with no choice adds food, coffee and shops", () => {
    const s = withBusinesses(new Set(), true);
    expect(s.has("coffee.cafe") && s.has("shop.grocery") && !s.has("parks.park")).toBe(true);
  });
});
