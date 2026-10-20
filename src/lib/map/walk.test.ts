import { describe, expect, it } from "vitest";
import {
  normalizeBearing,
  resolveWalkInput,
  stepPose,
  WALK_IDLE,
  WALK_SPEED,
  WALK_SPRINT,
  WALK_TURN_RATE,
  type WalkPose,
} from "./walk";

const START: WalkPose = {
  lon: -73.9857,
  lat: 40.7484,
  bearing: 0,
  zoom: 17,
};

describe("stepPose", () => {
  it("walks north along the bearing without drifting east", () => {
    const next = stepPose(START, { forward: 1, turn: 0, sprint: false }, 1);
    expect(next.lat).toBeGreaterThan(START.lat);
    expect(next.lon).toBeCloseTo(START.lon, 10);
    // One second at the walking speed, in degrees of latitude.
    expect(next.lat - START.lat).toBeCloseTo(WALK_SPEED / 111320, 6);
  });

  it("turns right into the east at a quarter turn", () => {
    const east: WalkPose = { ...START, bearing: 90 };
    const next = stepPose(east, { forward: 1, turn: 0, sprint: false }, 1);
    expect(next.lon).toBeGreaterThan(START.lon);
    expect(next.lat).toBeCloseTo(START.lat, 6);
  });

  it("moves backwards when forward is negative", () => {
    const next = stepPose(START, { forward: -1, turn: 0, sprint: false }, 1);
    expect(next.lat).toBeLessThan(START.lat);
  });

  it("stands still when nothing is pressed", () => {
    expect(stepPose(START, WALK_IDLE, 1)).toEqual(START);
  });

  it("covers sprint distance when sprinting", () => {
    const walked = stepPose(START, { forward: 1, turn: 0, sprint: false }, 1);
    const ran = stepPose(START, { forward: 1, turn: 0, sprint: true }, 1);
    const walkedMeters = (walked.lat - START.lat) * 111320;
    const ranMeters = (ran.lat - START.lat) * 111320;
    expect(ranMeters / walkedMeters).toBeCloseTo(WALK_SPRINT, 5);
  });

  it("clamps a long frame so a stalled tab cannot teleport", () => {
    const next = stepPose(START, { forward: 1, turn: 0, sprint: false }, 30);
    const meters = (next.lat - START.lat) * 111320;
    expect(meters).toBeLessThan(WALK_SPEED);
  });

  it("turns at the documented rate and wraps past north", () => {
    const turned = stepPose(START, { forward: 0, turn: 1, sprint: false }, 1);
    expect(turned.bearing).toBeCloseTo(WALK_TURN_RATE, 6);
    const wrapped = stepPose(
      { ...START, bearing: 350 },
      { forward: 0, turn: 1, sprint: false },
      1,
    );
    expect(wrapped.bearing).toBeCloseTo(70, 6);
  });
});

describe("normalizeBearing", () => {
  it("keeps bearings in [0, 360)", () => {
    expect(normalizeBearing(-90)).toBe(270);
    expect(normalizeBearing(720)).toBe(0);
    expect(normalizeBearing(45)).toBe(45);
  });
});

describe("resolveWalkInput", () => {
  it("prefers held keys over the on-screen pad", () => {
    const input = resolveWalkInput(new Set(["KeyW", "KeyD"]), {
      forward: -1,
      turn: -1,
      sprint: false,
    });
    expect(input.forward).toBe(1);
    expect(input.turn).toBe(1);
  });

  it("reads physical key codes, so the layout does not matter", () => {
    // AZERTY: the key labelled Z still reports KeyW.
    expect(resolveWalkInput(new Set(["KeyW"]), WALK_IDLE).forward).toBe(1);
    expect(resolveWalkInput(new Set(["KeyS"]), WALK_IDLE).forward).toBe(-1);
  });

  it("falls back to the pad when no key is held", () => {
    const input = resolveWalkInput(new Set(), {
      forward: -1,
      turn: 1,
      sprint: true,
    });
    expect(input).toEqual({ forward: -1, turn: 1, sprint: true });
  });

  it("treats shift as sprint", () => {
    expect(resolveWalkInput(new Set(["ShiftLeft"]), WALK_IDLE).sprint).toBe(true);
    expect(resolveWalkInput(new Set(["ShiftRight"]), WALK_IDLE).sprint).toBe(
      true,
    );
  });
});
