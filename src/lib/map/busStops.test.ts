import { describe, expect, it } from "vitest";
import { busStopIconOpacity, busStopTextOpacity } from "./busStops";

describe("bus stop icons", () => {
  it("keeps the zoom gate while bus stops are on", () => {
    expect(busStopIconOpacity(true)).toEqual(["step", ["zoom"], ["case", ["==", ["get", "class"], "bus"], 0, 1], 15, 1]);
    expect(busStopTextOpacity(true)).toEqual(["step", ["zoom"], ["case", ["==", ["get", "class"], "bus"], 0, 1], 17, 1]);
  });
  it("hides icons and names at every zoom when bus stops are off", () => {
    expect(busStopIconOpacity(false)).toBe(0);
    expect(busStopTextOpacity(false)).toBe(0);
  });
});
