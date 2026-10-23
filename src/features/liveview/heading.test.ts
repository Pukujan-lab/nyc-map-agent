import { describe, expect, it } from "vitest";
import { accuracyLine, accuracyTooLow, angleDiff, bearingTo, headingFromEvent, relativeBearing, smoothHeading } from "./heading";

describe("heading", () => {
  it("takes the short way round the circle", () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
    expect(smoothHeading(359, 1, 0.5)).toBeCloseTo(0, 5);
  });
  it("passes the first reading and damps jitter", () => {
    expect(smoothHeading(null, 123)).toBe(123);
    expect(smoothHeading(100, 140, 0.25)).toBeCloseTo(110);
  });
  it("reads iOS compass heading and Android absolute alpha", () => {
    expect(headingFromEvent({ alpha: 0, webkitCompassHeading: 90 })).toBe(90);
    expect(headingFromEvent({ alpha: 90, absolute: true })).toBe(270);
    expect(headingFromEvent({ alpha: 90, absolute: false })).toBeNull();
    expect(headingFromEvent({ alpha: null, absolute: true })).toBeNull();
  });
  it("computes the bearing relative to where the phone points", () => {
    expect(relativeBearing(90, 0)).toBe(90);
    expect(relativeBearing(10, 350)).toBe(20);
  });
  it("computes compass bearings between points", () => {
    expect(bearingTo({ lon: -74, lat: 40.7 }, { lon: -74, lat: 40.8 })).toBeCloseTo(0, 3);
    expect(bearingTo({ lon: -74, lat: 40.7 }, { lon: -73.9, lat: 40.7 })).toBeCloseTo(90, 0);
    expect(bearingTo({ lon: -74, lat: 40.8 }, { lon: -74, lat: 40.7 })).toBeCloseTo(180, 3);
  });
  it("states accuracy honestly and flags over 25 m", () => {
    expect(accuracyLine(12.4)).toBe("Location accuracy: about 12 m");
    expect(accuracyTooLow(25)).toBe(false);
    expect(accuracyTooLow(25.1)).toBe(true);
    expect(accuracyTooLow(null)).toBe(true);
  });
});
