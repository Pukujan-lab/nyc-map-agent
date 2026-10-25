import { describe, expect, it } from "vitest";
import { landmarkAtTurn, landmarksOnWay } from "./landmarksOnWay";
import type { GuideLandmark } from "../../../src/lib/guide/landmarkGuide";

const mark = (name: string, lon: number, lat: number) => ({ id: name, name, category: "civic", borough: "Manhattan", lon, lat }) as unknown as GuideLandmark;

// Walking west along 42nd St from 5th Ave toward 6th Ave.
const west42: Array<[number, number]> = [[-73.9805, 40.7532], [-73.9825, 40.7540], [-73.9845, 40.7548]];

describe("landmarksOnWay", () => {
  it("names what you pass, in order, with the hand it is on", () => {
    const library = mark("New York Public Library", -73.9825, 40.7537); // south of 42nd: walking west, that's the left
    const grace = mark("Grace Building", -73.9845, 40.7551); // north side: right
    const far = mark("Empire State Building", -73.9857, 40.7484);
    expect(landmarksOnWay(west42, [grace, far, library])).toEqual([
      { name: "New York Public Library", side: "left" },
      { name: "Grace Building", side: "right" },
    ]);
  });

  it("gives nothing for a line too short to have a direction", () => {
    expect(landmarksOnWay([west42[0]], [mark("x", -73.9805, 40.7532)])).toEqual([]);
  });
});

describe("landmarkAtTurn", () => {
  it("picks the nearest landmark within reach of the turn", () => {
    expect(landmarkAtTurn([-73.9825, 40.7540], [mark("Bryant Park", -73.9828, 40.7538), mark("Far", -73.99, 40.76)])).toBe("Bryant Park");
    expect(landmarkAtTurn([-73.9825, 40.7540], [mark("Far", -73.99, 40.76)])).toBeNull();
  });
});
