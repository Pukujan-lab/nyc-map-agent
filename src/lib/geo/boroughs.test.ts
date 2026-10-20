import { describe, expect, it } from "vitest";
import type { NtaBoundary, PolygonRings } from "@/lib/api/nta";
import { boroughOutlinesToGeoJson } from "./boroughs";

/** A unit square whose west edge is at x = 0. */
const west: PolygonRings = [
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ],
];

/** The neighbor sharing the x = 1 edge, listed the other way round. */
const east: PolygonRings = [
  [
    [1, 0],
    [1, 1],
    [2, 1],
    [2, 0],
    [1, 0],
  ],
];

function boundary(
  ntaCode: string,
  borough: string,
  polygons: PolygonRings[],
): NtaBoundary {
  return {
    ntaCode,
    ntaName: ntaCode,
    borough,
    bbox: [0, 0, 2, 1],
    center: [1, 0.5],
    polygons,
  };
}

describe("boroughOutlinesToGeoJson", () => {
  it("drops the edge two neighborhoods of the same borough share", () => {
    const collection = boroughOutlinesToGeoJson([
      boundary("BK1", "Brooklyn", [west]),
      boundary("BK2", "Brooklyn", [east]),
    ]);

    expect(collection.features).toHaveLength(1);
    // 4 + 4 edges, minus the shared one counted twice: 6 survive.
    expect(collection.features[0].geometry.coordinates).toHaveLength(6);
  });

  it("keeps every edge when the two squares are in different boroughs", () => {
    const collection = boroughOutlinesToGeoJson([
      boundary("BK1", "Brooklyn", [west]),
      boundary("MN1", "Manhattan", [east]),
    ]);

    expect(collection.features).toHaveLength(2);
    expect(
      collection.features.map((feature) => feature.properties.borough),
    ).toEqual(["Brooklyn", "Manhattan"]);
    for (const feature of collection.features) {
      expect(feature.geometry.coordinates).toHaveLength(4);
    }
  });

  it("returns nothing when there are no boundaries", () => {
    expect(boroughOutlinesToGeoJson([]).features).toHaveLength(0);
  });
});
