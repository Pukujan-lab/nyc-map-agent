import { describe, expect, it } from "vitest";
import { BUS_STOP_DOT_LAYERS, visibilityPatch } from "./busStopDots";

describe("bus stop dots", () => {
  it("hides stop dots without naming a vehicle layer", () => {
    expect(BUS_STOP_DOT_LAYERS).toEqual(["transit-bus-route-stop", "transit-bus-route-stop-name"]);
    expect(BUS_STOP_DOT_LAYERS.some((id) => id.includes("badge") || id.includes("vehicle"))).toBe(false);
  });
  it("writes visibility only when it would change", () => {
    expect(visibilityPatch(undefined, true)).toBeNull();
    expect(visibilityPatch("visible", true)).toBeNull();
    expect(visibilityPatch("visible", false)).toBe("none");
    expect(visibilityPatch("none", false)).toBeNull();
    expect(visibilityPatch("none", true)).toBe("visible");
  });
});
