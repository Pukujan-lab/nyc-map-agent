import { describe, expect, it } from "vitest";
import { formatMetres, instructionFor, parseGuidedRoute, progressAt, stepsUrl } from "./steps";

// A fake L-shaped walk: 0.001° east (~84 m at 40.75°N) then 0.001° north (~111 m).
const osrm = {
  code: "Ok",
  routes: [
    {
      geometry: { coordinates: [[-73.99, 40.75], [-73.989, 40.75], [-73.989, 40.751]] },
      legs: [
        {
          steps: [
            { distance: 84, name: "W 42 St", maneuver: { type: "depart", location: [-73.99, 40.75], bearing_after: 90 } },
            { distance: 111, name: "6 Av", maneuver: { type: "turn", modifier: "left", location: [-73.989, 40.75], bearing_after: 0 } },
            { distance: 0, name: "", maneuver: { type: "arrive", location: [-73.989, 40.751], bearing_after: 0 } },
          ],
        },
      ],
    },
  ],
};

describe("route steps", () => {
  it("asks the existing OSRM foot router for steps", () => {
    expect(stepsUrl({ lon: -73.99, lat: 40.75 }, { lon: -73.98, lat: 40.76 })).toMatch(/routed-foot\/route\/v1\/foot\/.*steps=true/);
  });

  it("words maneuvers plainly", () => {
    const r = parseGuidedRoute(osrm)!;
    expect(instructionFor(r.steps[1])).toBe("Turn left on 6 Av");
    expect(instructionFor(r.steps[2])).toBe("Arrive at your destination");
    expect(formatMetres(83)).toBe("80 m");
  });

  it("advances to the next maneuver as you walk", () => {
    const r = parseGuidedRoute(osrm)!;
    const atStart = progressAt(r, { lon: -73.99, lat: 40.75 })!;
    expect(atStart.nextIndex).toBe(1);
    expect(atStart.metresToNext).toBeGreaterThan(75);
    const pastCorner = progressAt(r, { lon: -73.989, lat: 40.7505 })!;
    expect(pastCorner.nextIndex).toBe(2);
    expect(pastCorner.instruction).toBe("Arrive at your destination");
  });

  it("rejects a failed response", () => {
    expect(parseGuidedRoute({ code: "NoRoute" })).toBeNull();
  });
});
