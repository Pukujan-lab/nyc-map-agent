import { describe, expect, it } from "vitest";
import { nearestStop } from "./TransitCard";
import { alertedRoutes, type TransitAlert } from "./hooks";

const alert = (p: Partial<TransitAlert>): TransitAlert => ({ id: "a", kind: "notice", type: "", reroute: false, text: "", agency: "", routes: [], stops: [], ...p });

describe("bus sheet helpers", () => {
  it("finds the stop nearest a point", () => {
    const stops = [{ id: "a", lon: -73.99, lat: 40.75 }, { id: "b", lon: -73.97, lat: 40.76 }];
    expect(nearestStop(stops, { lon: -73.971, lat: 40.759 })?.id).toBe("b");
    expect(nearestStop([], { lon: 0, lat: 0 })).toBeUndefined();
  });
  it("flags only delays and reroutes with '!'", () => {
    const s = alertedRoutes([alert({ routes: ["M42"], reroute: true }), alert({ routes: ["A"], kind: "delay" }), alert({ routes: ["Q"], kind: "planned", reroute: true })]);
    expect([...s].sort()).toEqual(["A", "M42"]);
  });
});
