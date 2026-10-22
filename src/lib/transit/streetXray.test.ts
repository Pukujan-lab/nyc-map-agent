import { describe, expect, it } from "vitest";
import { XRAY_VEIL_M, xrayVeilDisc } from "./streetXray";

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
