import { describe, expect, it } from "vitest";
import { compassWord, curbAxis, stairDescent } from "./stairs";
import type { NamedLine } from "./streetPos";

// 6 Av runs about 29° east of north in Manhattan's grid; W 56 St crosses it.
const sixthAv: NamedLine = { name: "6 Avenue", coords: [[-73.9785, 40.7625], [-73.9765, 40.7652]] };
const w56: NamedLine = { name: "W 56 Street", coords: [[-73.9800, 40.7630], [-73.9750, 40.7609]] };

describe("stair direction", () => {
  it("uses the mapped way up when there is one", () => {
    expect(stairDescent([-73.9775, 40.7638], [-73.977, 40.764], 200, [sixthAv])).toBe(20);
  });
  it("lies along the nearest curb, going down toward the station's side", () => {
    const at: [number, number] = [-73.97755, 40.76385];
    const axis = curbAxis([sixthAv, w56], at)!;
    expect(Math.round(axis)).toBeGreaterThan(20);
    expect(Math.round(axis)).toBeLessThan(40);
    // Station to the north-east: down is along 6 Av heading uptown.
    expect(Math.round(stairDescent(at, [-73.9768, 40.7648], undefined, [sixthAv, w56]))).toBe(Math.round(axis));
    // Station to the south-west: the same curb, the other way.
    expect(Math.round(stairDescent(at, [-73.9782, 40.7628], undefined, [sixthAv, w56]))).toBe(Math.round(axis + 180));
  });
  it("points at the station when no street is near", () => {
    expect(Math.round(stairDescent([-73.9, 40.7], [-73.9, 40.701], undefined, [sixthAv]))).toBe(0);
  });
  it("says headings in words", () => {
    expect(compassWord(0)).toBe("north");
    expect(compassWord(200)).toBe("south");
    expect(compassWord(-45)).toBe("northwest");
  });
});
