import { describe, expect, it } from "vitest";
import { parseRange, partSlices } from "../city-tiles";

describe("city tiles range stitching", () => {
  const parts = [{ url: "a", bytes: 100 }, { url: "b", bytes: 50 }];
  it("parses single ranges", () => {
    expect(parseRange("bytes=0-9", 150)).toEqual([0, 9]);
    expect(parseRange("bytes=140-", 150)).toEqual([140, 149]);
    expect(parseRange("bytes=-10", 150)).toEqual([140, 149]);
    expect(parseRange("bytes=200-300", 150)).toBeNull();
  });
  it("maps a range inside one part", () => {
    expect(partSlices(parts, 10, 19)).toEqual([{ url: "a", from: 10, to: 19 }]);
    expect(partSlices(parts, 120, 129)).toEqual([{ url: "b", from: 20, to: 29 }]);
  });
  it("splits a range across the part boundary", () => {
    expect(partSlices(parts, 95, 104)).toEqual([
      { url: "a", from: 95, to: 99 },
      { url: "b", from: 0, to: 4 },
    ]);
  });
});
