import { describe, expect, it } from "vitest";
import type { NtaBoundary, PolygonRings } from "@/lib/api/nta";
import { pointInPolygonRings, pointInRing } from "./pointInPolygon";
import { NtaIndex } from "./ntaIndex";

const square: PolygonRings = [
  [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
    [0, 0],
  ],
];

const donut: PolygonRings = [
  [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
    [0, 0],
  ],
  [
    [4, 4],
    [4, 6],
    [6, 6],
    [6, 4],
    [4, 4],
  ],
];

describe("pointInRing", () => {
  it("detects inside and outside points", () => {
    expect(pointInRing(5, 5, square[0])).toBe(true);
    expect(pointInRing(15, 5, square[0])).toBe(false);
    expect(pointInRing(-1, 5, square[0])).toBe(false);
    expect(pointInRing(5, -1, square[0])).toBe(false);
  });

  it("handles concave shapes", () => {
    const lShape: PolygonRings = [
      [
        [0, 0],
        [0, 10],
        [4, 10],
        [4, 4],
        [10, 4],
        [10, 0],
        [0, 0],
      ],
    ];
    expect(pointInPolygonRings(2, 8, lShape)).toBe(true);
    expect(pointInPolygonRings(8, 2, lShape)).toBe(true);
    expect(pointInPolygonRings(8, 8, lShape)).toBe(false);
  });
});

describe("pointInPolygonRings", () => {
  it("treats inner rings as holes", () => {
    expect(pointInPolygonRings(1, 1, donut)).toBe(true);
    expect(pointInPolygonRings(5, 5, donut)).toBe(false);
    expect(pointInPolygonRings(20, 5, donut)).toBe(false);
  });

  it("returns false for an empty polygon", () => {
    expect(pointInPolygonRings(1, 1, [])).toBe(false);
  });
});

describe("NtaIndex", () => {
  const boundaries: NtaBoundary[] = [
    {
      ntaCode: "QN0101",
      ntaName: "Alpha",
      borough: "Queens",
      bbox: [0, 0, 10, 10] as [number, number, number, number],
      center: [5, 5] as [number, number],
      polygons: [square],
    },
    {
      ntaCode: "BK0101",
      ntaName: "Beta",
      borough: "Brooklyn",
      bbox: [20, 0, 30, 10] as [number, number, number, number],
      center: [25, 5] as [number, number],
      polygons: [
        [
          [
            [20, 0],
            [20, 10],
            [30, 10],
            [30, 0],
            [20, 0],
          ],
        ],
      ],
    },
  ];

  it("assigns points to the right neighborhood", () => {
    const index = new NtaIndex(boundaries);
    expect(index.assignCode(5, 5)).toBe("QN0101");
    expect(index.assignCode(5, 25)).toBe("BK0101");
    expect(index.assignCode(50, 50)).toBeNull();
  });

  it("does not leak across bucket boundaries", () => {
    const index = new NtaIndex(boundaries);
    expect(index.assignCode(15, 15)).toBeNull();
  });
});
