import { describe, expect, it } from "vitest";
import { bladeName, cornerOffset, crossingsNear, onPavement, streetBearingAt } from "./signPlacement";

describe("cornerOffset", () => {
  it("puts a right-angle corner pole 6.5 m off both centrelines", () => {
    const [x, y] = cornerOffset(90, 0);
    expect(x).toBeCloseTo(6.5);
    expect(y).toBeCloseTo(6.5);
  });
  it("keeps the setback from each street for a skewed crossing", () => {
    const [x] = cornerOffset(60, 0);
    // distance from the north-south centreline (x = 0) is |x|
    expect(Math.abs(x)).toBeCloseTo(6.5);
  });
  it("caps very acute corners and ignores parallel streets", () => {
    const [x, y] = cornerOffset(10, 0, 6.5, 14);
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(14.0001);
    expect(cornerOffset(0, 180)).toEqual([0, 0]);
  });
});

describe("streetBearingAt", () => {
  it("returns the bearing of the nearest street segment", () => {
    const ew: Array<[number, number]> = [[-73.99, 40.718], [-73.98, 40.718]];
    const ns: Array<[number, number]> = [[-73.9881, 40.71], [-73.9881, 40.73]];
    expect(streetBearingAt([ew, ns], -73.985, 40.71805)).toBeCloseTo(90, 0);
    expect(streetBearingAt([ew, ns], -73.98805, 40.725)).toBeCloseTo(0, 0);
    expect(streetBearingAt([ew], -73.95, 40.75)).toBeNull();
  });
});

describe("crossingsNear", () => {
  const grand = { name: "Grand Street", coords: [[-73.992, 40.7183], [-73.985, 40.7177]] as Array<[number, number]> };
  const essex = { name: "Essex Street", coords: [[-73.9886, 40.715], [-73.988, 40.721]] as Array<[number, number]> };
  it("finds the crossing of two named streets with their bearings", () => {
    const [c] = crossingsNear([grand, essex], { lng: -73.989, lat: 40.718 });
    expect(c.a).toBe("Grand St");
    expect(c.b).toBe("Essex St");
    expect(c.lng).toBeCloseTo(-73.9883, 3);
    expect(c.lat).toBeCloseTo(40.718, 3);
    expect(Math.round(c.ba / 10)).toBe(10); // ~ESE
    expect(Math.round(c.bb / 10) % 36).toBe(0); // ~N
  });
  it("ignores far crossings and same-name joints", () => {
    expect(crossingsNear([grand, essex], { lng: -73.95, lat: 40.75 })).toEqual([]);
    expect(crossingsNear([grand, { ...grand, name: "Grand Street" }], { lng: -73.989, lat: 40.718 })).toEqual([]);
  });
});

describe("bladeName", () => {
  it("abbreviates as the green signs do", () => {
    expect(bladeName("West 44th Street")).toBe("W 44 St");
    expect(bladeName("Avenue of the Americas")).toBe("Av of the Americas");
    expect(bladeName("Essex Street")).toBe("Essex St");
  });
});

describe("onPavement", () => {
  // An east-west street along lat 40.75.
  const street: Array<Array<[number, number]>> = [[[-73.99, 40.75], [-73.98, 40.75]]];
  const north = (m: number) => 40.75 + m / 111_320;

  it("moves a point recorded inside a building out to the pavement", () => {
    const [lng, lat] = onPavement(street, -73.985, north(30));
    expect(lng).toBeCloseTo(-73.985, 6);
    expect((lat - 40.75) * 111_320).toBeCloseTo(7, 1);
  });

  it("keeps a point already on the pavement, and one far from any street", () => {
    expect(onPavement(street, -73.985, north(8))).toEqual([-73.985, north(8)]);
    expect(onPavement(street, -73.985, north(80))).toEqual([-73.985, north(80)]);
  });

  it("stays on the side of the street it was recorded on", () => {
    const [, lat] = onPavement(street, -73.985, north(-25));
    expect((lat - 40.75) * 111_320).toBeCloseTo(-7, 1);
  });
});
