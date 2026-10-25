import { afterEach, describe, expect, it, vi } from "vitest";
import { followTripRoute, pickRouteVehicle, registerRouteFollower } from "./routeFollow";
const request = { system: "subway" as const, route: "6", at: [-73.98, 40.75] as [number, number] };
const vehicle = { key: "subway:a", system: "subway", route: "6X", lon: -73.98, lat: 40.751 };
afterEach(() => registerRouteFollower(null));
describe("trip to vehicle handoff", () => {
  it("picks the nearest train on the selected line, including express variants", () => {
    const far = { ...vehicle, key: "far", lat: 40.8 };
    expect(pickRouteVehicle([far, vehicle], request)).toEqual(vehicle);
  });
  it("never substitutes another route or another transport system", () => {
    expect(pickRouteVehicle([{ ...vehicle, route: "4" }, { ...vehicle, system: "bus" }], request)).toBeNull();
    expect(pickRouteVehicle([], request)).toBeNull();
    expect(pickRouteVehicle([{ ...vehicle, system: "bus", route: "BX" }], { ...request, system: "bus", route: "B" })).toBeNull();
  });
  it("returns false when transit is unavailable and forwards a registered request", () => {
    expect(followTripRoute(request)).toBe(false);
    const handler = vi.fn(() => true);
    registerRouteFollower(handler);
    expect(followTripRoute(request)).toBe(true);
    expect(handler).toHaveBeenCalledWith(request);
    registerRouteFollower(null);
    expect(followTripRoute(request)).toBe(false);
  });
});
