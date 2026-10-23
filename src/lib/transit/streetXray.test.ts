import { describe, expect, it } from "vitest";
import { XRAY_VEIL_M, xrayForFollow, xrayVeilDisc } from "./streetXray";

describe("xray veil", () => {
  it("is a nearby disc, the same size at every zoom", () => {
    expect(XRAY_VEIL_M).toBe(250);
    const ring = (xrayVeilDisc(-73.99, 40.74).features[0].geometry as GeoJSON.Polygon).coordinates[0];
    const [lon, lat] = ring[0];
    const dx = (lon - -73.99) * 111_320 * Math.cos((40.74 * Math.PI) / 180);
    const dy = (lat - 40.74) * 111_320;
    expect(Math.hypot(dx, dy)).toBeCloseTo(XRAY_VEIL_M, 0);
  });
});

describe("x-ray follows the train", () => {
  it("turns on underground, off in the open, and off when the rider steps off", () => {
    expect(xrayForFollow(false, false, null)).toBeNull();
    expect(xrayForFollow(false, true, true)).toBe(true);
    expect(xrayForFollow(true, true, false)).toBe(false);
    expect(xrayForFollow(true, true, null)).toBeNull();
    expect(xrayForFollow(true, false, null)).toBe(false);
  });
});
