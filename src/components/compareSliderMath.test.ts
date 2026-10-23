import { describe, expect, it } from "vitest";
import {
  DIVIDER_DEFAULT,
  clampDivider,
  nudgeDivider,
  orientationForWidth,
  pointerToPercent,
} from "./compareSliderMath";

describe("clampDivider", () => {
  it("keeps in-range values and clamps the rest", () => {
    expect(clampDivider(42)).toBe(42);
    expect(clampDivider(-5)).toBe(10);
    expect(clampDivider(250)).toBe(90);
  });
  it("falls back to the default for NaN/Infinity", () => {
    expect(clampDivider(NaN)).toBe(DIVIDER_DEFAULT);
    expect(clampDivider(Infinity)).toBe(DIVIDER_DEFAULT);
  });
  it("tolerates swapped bounds", () => {
    expect(clampDivider(5, 80, 20)).toBe(20);
  });
});

describe("pointerToPercent", () => {
  it("maps a pointer inside the track", () => {
    expect(pointerToPercent(300, 100, 400)).toBe(50);
  });
  it("clamps outside the track", () => {
    expect(pointerToPercent(0, 100, 400)).toBe(10);
    expect(pointerToPercent(900, 100, 400)).toBe(90);
  });
  it("returns the default for a zero-size track", () => {
    expect(pointerToPercent(10, 0, 0)).toBe(DIVIDER_DEFAULT);
  });
});

describe("nudgeDivider", () => {
  it("uses left/right when beside, up/down when under", () => {
    expect(nudgeDivider(50, "ArrowRight", "beside")).toBe(55);
    expect(nudgeDivider(50, "ArrowLeft", "beside")).toBe(45);
    expect(nudgeDivider(50, "ArrowDown", "beside")).toBeNull();
    expect(nudgeDivider(50, "ArrowDown", "under")).toBe(55);
    expect(nudgeDivider(50, "ArrowUp", "under")).toBe(45);
  });
  it("takes a large step and clamps", () => {
    expect(nudgeDivider(50, "ArrowRight", "beside", true)).toBe(70);
    expect(nudgeDivider(88, "ArrowRight", "beside")).toBe(90);
  });
  it("jumps with Home/End and ignores other keys", () => {
    expect(nudgeDivider(50, "Home", "beside")).toBe(10);
    expect(nudgeDivider(50, "End", "under")).toBe(90);
    expect(nudgeDivider(50, "a", "beside")).toBeNull();
  });
});

describe("orientationForWidth", () => {
  it("stacks on narrow containers", () => {
    expect(orientationForWidth(375)).toBe("under");
    expect(orientationForWidth(560)).toBe("beside");
  });
});
