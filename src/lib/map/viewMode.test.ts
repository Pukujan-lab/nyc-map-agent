import { describe, expect, it } from "vitest";
import { ELEVATED_HEIGHT_M, ELEVATED_PITCH, activeView, elevatedEye, getViewState, setElevated, setXray, setXrayAuto } from "./viewMode";

describe("view mode", () => {
  it("Elevated is 60 m up, tilted 55°", () => {
    expect(ELEVATED_HEIGHT_M).toBe(60);
    expect(ELEVATED_PITCH).toBe(55);
  });
  it("stands the elevated eye behind the centre along the bearing", () => {
    const north = elevatedEye({ lng: -73.98, lat: 40.75 }, 0);
    expect(north.back).toBeCloseTo(60 * Math.tan((55 * Math.PI) / 180), 6);
    expect(north.lat).toBeLessThan(40.75);
    expect(north.lng).toBeCloseTo(-73.98, 9);
    const east = elevatedEye({ lng: -73.98, lat: 40.75 }, 90);
    expect(east.lng).toBeLessThan(-73.98);
    expect(east.lat).toBeCloseTo(40.75, 9);
  });
  it("lights street over elevated over map", () => {
    expect(activeView(true, true)).toBe("street");
    expect(activeView(false, true)).toBe("elevated");
    expect(activeView(false, false)).toBe("map");
  });
  it("keeps manual and automatic x-ray apart", () => {
    setXray(true); setXrayAuto(false); setElevated(true);
    expect(getViewState()).toEqual({ elevated: true, xray: true, xrayAuto: false });
    setXray(false); setXrayAuto(true); setElevated(false);
    expect(getViewState()).toEqual({ elevated: false, xray: false, xrayAuto: true });
    setXrayAuto(false);
  });
});
