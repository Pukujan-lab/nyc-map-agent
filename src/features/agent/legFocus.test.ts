import { describe, expect, it } from "vitest";
import { legFocus } from "./legFocus";
import type { Leg } from "./schema";

describe("tapping a trip step shows it on the map", () => {
  it("marks where to board and where to get off on a ride, and frames the ride", () => {
    const ride = { kind: "ride", label: "Q38", route: "Q38", mode: "bus", coords: [[-73.87, 40.73], [-73.88, 40.72], [-73.89, 40.71]], fromStop: "63 Dr/Woodhaven Blvd", toStop: "Metropolitan Av/Metro Mall" } as unknown as Leg;
    const f = legFocus(ride)!;
    expect(f.marks.map((m) => m.name)).toEqual(["Board at 63 Dr/Woodhaven Blvd", "Get off at Metropolitan Av/Metro Mall"]);
    expect(f.bounds).toEqual([[-73.89, 40.71], [-73.87, 40.73]]);
  });
  it("marks the end of a walk", () => {
    const walk = { kind: "walk", label: "Walk to Broadway/Whitney Av", coords: [[-73.87, 40.74], [-73.871, 40.741]], durationS: 120 } as unknown as Leg;
    expect(legFocus(walk)!.marks).toEqual([{ at: [-73.871, 40.741], name: "Walk to Broadway/Whitney Av" }]);
  });
});
