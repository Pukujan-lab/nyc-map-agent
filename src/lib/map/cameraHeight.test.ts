import { describe, expect, it } from "vitest";
import { formatHeight, heightFromSlider, MAX_HEIGHT_M, MIN_HEIGHT_M, pitchForHeight, sliderFromHeight } from "./cameraHeight";

describe("camera height slider", () => {
  it("runs from eye level to overhead", () => {
    expect(heightFromSlider(0)).toBeCloseTo(MIN_HEIGHT_M);
    expect(heightFromSlider(100)).toBeCloseTo(MAX_HEIGHT_M);
    expect(pitchForHeight(MAX_HEIGHT_M)).toBeCloseTo(0);
    expect(pitchForHeight(MIN_HEIGHT_M)).toBeCloseTo(80);
  });
  it("round-trips", () => {
    for (const t of [0, 13, 50, 87, 100]) expect(sliderFromHeight(heightFromSlider(t))).toBeCloseTo(t);
  });
  it("formats", () => {
    expect(formatHeight(1.7)).toBe("1.7 m");
    expect(formatHeight(120.4)).toBe("120 m");
    expect(formatHeight(2500)).toBe("2.5 km");
  });
});
