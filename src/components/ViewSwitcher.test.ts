import { describe, expect, it } from "vitest";
import { fitScale, levelOf } from "./ViewSwitcher";

describe("fitScale", () => {
  it("leaves a row that fits, and shrinks one that is wider than a phone", () => {
    expect(fitScale(800, 497)).toBe(1);
    expect(fitScale(366, 497)).toBeCloseTo(366 / 497);
    expect(fitScale(0, 497)).toBe(1);
    expect(fitScale(366, 0)).toBe(1);
  });
});

describe("levelOf", () => {
  it("maps the camera to a level", () => {
    expect(levelOf(true, 1.7, 85)).toBe("street");
    expect(levelOf(false, 60, 70)).toBe("mid");
    expect(levelOf(false, 300, 55)).toBe("up");
    expect(levelOf(false, 800, 0)).toBe("top");
  });
});
