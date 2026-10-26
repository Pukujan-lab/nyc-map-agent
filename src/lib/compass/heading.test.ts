import { describe, expect, it } from "vitest";
import { accuracyFromEvent, adaptiveAlpha, angleDiff, CALIBRATED_SWEEP_DEG, headingFromEvent, headingReducer, initialHeading, needsCalibration, smoothHeading, type HeadingEvent, type HeadingState } from "./heading";

const run = (events: HeadingEvent[], from: HeadingState = initialHeading) => events.reduce(headingReducer, from);

describe("heading smoothing", () => {
  it("takes the short way round north", () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
    expect(smoothHeading(359, 1, 0.5)).toBeCloseTo(0, 5);
  });

  it("passes the first reading straight through", () => {
    expect(smoothHeading(null, 123)).toBe(123);
    expect(run([{ type: "compass", heading: 123, accuracyDeg: 10 }]).heading).toBe(123);
  });

  it("damps small wobbles more than real turns", () => {
    expect(adaptiveAlpha(2)).toBeLessThan(adaptiveAlpha(20));
    expect(adaptiveAlpha(20)).toBeLessThan(adaptiveAlpha(90));
    // Jitter of ±3° around 90 keeps the arrow within a degree of 90.
    const jitter = run([90, 93, 87, 92, 88, 93, 87].map((h) => ({ type: "compass", heading: h, accuracyDeg: 10 })));
    expect(Math.abs(angleDiff(90, jitter.heading!))).toBeLessThan(1);
  });

  it("catches up with a real turn within a few readings", () => {
    const turned = run([{ type: "compass", heading: 0, accuracyDeg: 10 }, ...Array.from({ length: 6 }, () => ({ type: "compass", heading: 90, accuracyDeg: 10 }) as const)]);
    expect(Math.abs(angleDiff(turned.heading!, 90))).toBeLessThan(10);
  });

  it("reads iOS compass heading and Android absolute alpha", () => {
    expect(headingFromEvent({ alpha: 0, webkitCompassHeading: 90 })).toBe(90);
    expect(headingFromEvent({ alpha: 90, absolute: true })).toBe(270);
    expect(headingFromEvent({ alpha: 90, absolute: false })).toBeNull();
    expect(accuracyFromEvent({ alpha: 0, webkitCompassAccuracy: -1 })).toBe(-1);
    expect(accuracyFromEvent({ alpha: 0 })).toBeNull();
  });
});

describe("calibration state", () => {
  it("asks for a figure 8 when iOS says the compass is uncalibrated or poor", () => {
    expect(needsCalibration(-1, 0)).toBe(true);
    expect(needsCalibration(45, 0)).toBe(true);
    expect(needsCalibration(10, 0)).toBe(false);
    expect(run([{ type: "compass", heading: 10, accuracyDeg: -1 }]).calibrate).toBe(true);
    expect(run([{ type: "compass", heading: 10, accuracyDeg: 12 }]).calibrate).toBe(false);
  });

  it("without an accuracy figure, trusts the compass only once the phone has turned", () => {
    const still = run([{ type: "compass", heading: 10, accuracyDeg: null }, { type: "compass", heading: 11, accuracyDeg: null }]);
    expect(still.calibrate).toBe(true);
    const steps = Array.from({ length: 8 }, (_, i) => ({ type: "compass", heading: 10 + i * 10, accuracyDeg: null }) as const);
    const moved = run(steps);
    expect(moved.sweptDeg).toBeGreaterThanOrEqual(CALIBRATED_SWEEP_DEG);
    expect(moved.calibrate).toBe(false);
  });

  it("clears the hint once iOS reports good accuracy again", () => {
    const s = run([{ type: "compass", heading: 10, accuracyDeg: -1 }, { type: "compass", heading: 12, accuracyDeg: 15 }]);
    expect(s.calibrate).toBe(false);
    expect(s.source).toBe("compass");
  });

  it("falls back to the walking heading when there is no compass", () => {
    const s = run([{ type: "move", heading: 180 }]);
    expect(s.source).toBe("movement");
    expect(s.heading).toBe(180);
    expect(s.calibrate).toBe(false);
  });

  it("keeps the walking heading while the compass is still uncalibrated", () => {
    const s = run([{ type: "move", heading: 180 }, { type: "compass", heading: 20, accuracyDeg: -1 }]);
    expect(s.source).toBe("movement");
    expect(s.heading).toBe(180);
    expect(s.calibrate).toBe(true);
  });

  it("a calibrated compass is not overridden by walking", () => {
    const s = run([{ type: "compass", heading: 20, accuracyDeg: 5 }, { type: "move", heading: 200 }]);
    expect(s.source).toBe("compass");
    expect(s.heading).toBe(20);
  });
});
