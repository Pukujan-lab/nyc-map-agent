import { describe, expect, it } from "vitest";
import { distanceToRoute, poiSummary, poisAlongRoute } from "./routePois";
import type { GuidedRoute } from "./steps";

// ~84 m east along 40.75N, then ~111 m north.
const route: GuidedRoute = {
  coordinates: [[-73.99, 40.75], [-73.989, 40.75], [-73.989, 40.751]],
  steps: [],
};
const restroom = (name: string, lon: number, lat: number, status = "Operational") => ({
  geometry: { coordinates: [lon, lat] as [number, number] },
  properties: { name, status, location_type: "Park" },
});

describe("poisAlongRoute", () => {
  it("measures distance to the nearest segment", () => {
    expect(distanceToRoute(route.coordinates, -73.9895, 40.75)).toBeLessThan(1);
    expect(distanceToRoute(route.coordinates, -73.9895, 40.7505)).toBeGreaterThan(30);
  });

  it("buckets by kind and drops anything past 50 m or closed", () => {
    const pois = poisAlongRoute(route, {
      restrooms: [
        restroom("Near", -73.9895, 40.75005),
        restroom("Far", -73.9895, 40.7515),
        restroom("Shut", -73.9895, 40.75005, "Closed"),
      ],
      transit: [{ name: "Bus stop", lon: -73.98895, lat: 40.7505 }],
      landmarks: [{ name: "Tower", lon: -73.98, lat: 40.75 }],
    });
    expect(pois.restroom.map((p) => p.name)).toEqual(["Near"]);
    expect(pois.transit.map((p) => p.name)).toEqual(["Bus stop"]);
    expect(pois.landmark).toEqual([]);
  });

  it("orders by distance along the route", () => {
    const pois = poisAlongRoute(route, {
      restrooms: [restroom("Late", -73.98895, 40.7508), restroom("Early", -73.9895, 40.75)],
    });
    expect(pois.restroom.map((p) => p.name)).toEqual(["Early", "Late"]);
  });
});

describe("poiSummary", () => {
  it("lists only upcoming POIs, mixing kinds first, capped", () => {
    const pois = poisAlongRoute(route, {
      restrooms: [restroom("Behind", -73.9899, 40.75), restroom("A", -73.9895, 40.75), restroom("B", -73.9893, 40.75)],
      transit: [{ name: "Stop", lon: -73.98895, lat: 40.7505 }],
    });
    const s = poiSummary(pois, 40, 200, 2);
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.kind).sort()).toEqual(["restroom", "transit"]);
    expect(s.some((x) => x.text.includes("Behind"))).toBe(false);
    expect(poiSummary(pois, 40, 1)).toEqual([]);
  });
});
