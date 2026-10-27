import { describe, expect, it } from "vitest";
import { osmStairs } from "./build-entrance-stairs";

describe("osmStairs", () => {
  it("reads up as the reverse of the steps leaving the street-level entrance", () => {
    const els = [
      { type: "node" as const, id: 1, lat: 40.7600, lon: -73.98 },
      { type: "way" as const, id: 9, nodes: [1, 2], geometry: [{ lat: 40.7600, lon: -73.98 }, { lat: 40.7599, lon: -73.98 }] },
    ];
    expect(osmStairs(els)).toEqual([{ at: [-73.98, 40.76], up: 0 }]);
  });
  it("flips for an entrance mapped below the street", () => {
    const els = [
      { type: "node" as const, id: 1, lat: 40.7600, lon: -73.98, tags: { level: "-1" } },
      { type: "way" as const, id: 9, nodes: [2, 1], geometry: [{ lat: 40.7599, lon: -73.98 }, { lat: 40.7600, lon: -73.98 }] },
    ];
    expect(osmStairs(els)).toEqual([{ at: [-73.98, 40.76], up: 180 }]);
  });
});
