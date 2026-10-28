import { describe, expect, it } from "vitest";
import { stairsFrom, surfacedFacing, type Fix, type Stair } from "./surfacing";

const stair: Stair = { at: [-73.97594, 40.75129], up: 290 };
const below = (t: number): Fix => ({ t, at: [-73.9762, 40.7515], accuracy: 120 });

describe("coming up a subway stair", () => {
  it("faces the stair's way up on the first sharp fix beside it", () => {
    const fixes = [below(0), below(500), below(1000), { t: 1500, at: stair.at, accuracy: 8 }];
    expect(surfacedFacing(fixes, [stair])).toBe(290);
  });

  it("says nothing on later street fixes, far from a stair, or without time below", () => {
    const up = { t: 1500, at: stair.at, accuracy: 8 };
    expect(surfacedFacing([below(0), below(500), below(1000), up, { ...up, t: 2000 }], [stair])).toBeNull();
    expect(surfacedFacing([below(0), below(500), below(1000), { ...up, at: [-73.97, 40.75] }], [stair])).toBeNull();
    expect(surfacedFacing([below(1000), up], [stair])).toBeNull();
  });

  it("takes mapped steps' way up, else away from the station, and skips passages", () => {
    const list = stairsFrom({
      stations: { features: [{ properties: { id: "1" }, geometry: { coordinates: [0, 0] } }] },
      entrances: { features: [
        { properties: { id: "1", kind: "stair", up: 12 }, geometry: { coordinates: [0, 0.001] } },
        { properties: { id: "1", kind: "stair" }, geometry: { coordinates: [0.001, 0] } },
        { properties: { id: "1", kind: "passage" }, geometry: { coordinates: [0, -0.001] } },
      ] },
    });
    expect(list.map((s) => Math.round(s.up))).toEqual([12, 90]);
  });
});
