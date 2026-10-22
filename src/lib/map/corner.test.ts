import { describe, expect, it } from "vitest";
import { cornerLabel, nearestCorner, titleStreet } from "./corner";

describe("corner label", () => {
  it("title-cases sign names", () => {
    expect(titleStreet("W 44 ST")).toBe("W 44 St");
    expect(titleStreet("8 AV")).toBe("8 Av");
  });
  it("puts the avenue second", () => {
    expect(cornerLabel("8 AV", "W 44 ST")).toBe("W 44 St at 8 Av");
    expect(cornerLabel("W 44 ST", "8 AV")).toBe("W 44 St at 8 Av");
    expect(cornerLabel("AV OF THE AMERICAS", "W 40 ST")).toBe("W 40 St at Av Of The Americas");
  });
  it("picks the nearest sign within range", () => {
    const signs = [
      { lng: -73.9885, lat: 40.7593, a: "8 AV", b: "W 44 ST" },
      { lng: -73.9870, lat: 40.7600, a: "8 AV", b: "W 45 ST" },
    ];
    expect(nearestCorner(signs, -73.9886, 40.7594)).toBe("W 44 St at 8 Av");
    expect(nearestCorner(signs, -73.9, 40.7)).toBeNull();
  });
});
