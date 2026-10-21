import { describe, expect, it } from "vitest";
import { FOCUS_KEY, WORLD, readFocus } from "./transitFocus";

describe("transit focus", () => {
  it("is off unless the saved choice is on", () => {
    expect(readFocus({ getItem: () => null })).toBe(false);
    expect(readFocus({ getItem: (k) => (k === FOCUS_KEY ? "1" : null) })).toBe(true);
    expect(readFocus({ getItem: () => { throw new Error("blocked"); } })).toBe(false);
  });
  it("veils the whole map", () => {
    const g = WORLD.features[0].geometry as GeoJSON.Polygon;
    expect(g.coordinates[0]).toHaveLength(5);
    expect(g.coordinates[0][0]).toEqual([-180, -85]);
  });
});
