import { describe, expect, it } from "vitest";
import { getQuickLayer, setQuickLayer } from "./quickLayers";

describe("quick layers store", () => {
  it("defaults businesses and street art on, x-ray off", () => {
    expect(getQuickLayer("businesses")).toBe(true);
    expect(getQuickLayer("streetArt")).toBe(true);
    expect(getQuickLayer("xray")).toBe(false);
  });
  it("toggles", () => {
    setQuickLayer("xray", true);
    expect(getQuickLayer("xray")).toBe(true);
  });
});
