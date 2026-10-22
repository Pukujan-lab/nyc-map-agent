import { describe, expect, it } from "vitest";
import { conflate, laneOffset } from "./conflate";

const M = 1 / 111_320;
describe("conflate", () => {
  const street = { coords: [[-73.99, 40.7], [-73.99, 40.71]] as Array<[number, number]>, twoWay: true, widthM: 18 };
  it("moves shape vertices onto a nearby parallel centerline and records the lane offset", () => {
    const off = 10 * M / Math.cos((40.7 * Math.PI) / 180); // 10 m east, on the sidewalk side
    const { lines, offsets } = conflate([[[-73.99 + off, 40.701], [-73.99 + off, 40.705]]], [street]);
    expect(lines[0][0][0]).toBeCloseTo(-73.99, 5);
    expect(offsets[0][0]).toBeCloseTo(4.5, 1);
  });
  it("ignores perpendicular or distant streets", () => {
    const cross = { coords: [[-73.995, 40.703], [-73.985, 40.703]] as Array<[number, number]>, twoWay: true, widthM: 18 };
    const line: Array<[number, number]> = [[-73.98, 40.7029], [-73.98, 40.704]];
    expect(conflate([line], [street, cross]).lines[0]).toEqual(line);
  });
  it("one-way streets put the bus in the curb lane", () => {
    expect(laneOffset({ twoWay: false, widthM: 12 })).toBe(2);
    expect(laneOffset({ twoWay: true, widthM: 4 })).toBe(1.8);
  });
});
