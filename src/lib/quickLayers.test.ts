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

import { withQuickPlaces } from "@/lib/map/places";
describe("withQuickPlaces", () => {
  it("off strips a group, keeps groups that are on", () => {
    expect([...withQuickPlaces(new Set(["food.restaurant", "parks.park", "health.care"]), { parksPlaces: true })]).toEqual(["parks.park"]);
  });
  it("on with no choice adds food, coffee and shops", () => {
    const s = withQuickPlaces(new Set(), { businesses: true });
    expect(s.has("coffee.cafe") && s.has("shop.grocery") && !s.has("parks.park")).toBe(true);
  });
});
