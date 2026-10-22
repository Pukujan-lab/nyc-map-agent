import { describe, expect, it } from "vitest";
import { followRig } from "./follow";

describe("followRig", () => {
  it("chase sits behind the vehicle and looks ahead", () => {
    const { eye, look } = followRig("chase", 0, 0); // heading north
    expect(eye[1]).toBeLessThan(0);
    expect(look[1]).toBeGreaterThan(0);
  });
  it("side sits to the right of the heading", () => {
    expect(followRig("side", 0, 0).eye[0]).toBeGreaterThan(0);
  });
  it("overhead is high above, cab just above the deck", () => {
    expect(followRig("overhead", 90, 8).eye[2]).toBeGreaterThan(300);
    expect(followRig("cab", 90, 8).eye[2]).toBeCloseTo(11.2);
  });
});
