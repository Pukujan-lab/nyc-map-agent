import { describe, expect, it } from "vitest";
import { estimate, toFerryData } from "./routes";

const s = (dep: number, arr: number, lon: number, lat: number) => ({ scheduledDeparture: dep, scheduledArrival: arr, serviceDay: 1000, stop: { lon, lat } });

describe("ferry glue", () => {
  it("interpolates a scheduled vessel between stops, null when not running", () => {
    const times = [s(100, 100, -74, 40.7), s(300, 300, -73.9, 40.7)];
    expect(estimate(times, 1200)).toMatchObject({ lon: -73.95, lat: 40.7 });
    expect(estimate(times, 2000)).toBeNull();
  });
  it("prefers live positions over schedule estimates for a route", () => {
    const pattern = { geometry: [{ lat: 40.7, lon: -74 }, { lat: 40.6, lon: -73.9 }], stops: [{ gtfsId: "F:1", name: "Wall St/Pier 11", lat: 40.7, lon: -74 }], tripsForDate: [{ gtfsId: "F:t1", stoptimes: [s(100, 100, -74, 40.7), s(300, 300, -73.9, 40.7)] }] };
    const sched = toFerryData({ routes: [{ gtfsId: "FERRY:RS", shortName: "RS", longName: "Rockaway-Soundview", color: "4E008E", patterns: [{ ...pattern, vehiclePositions: [] }] }] }, 1200);
    expect(sched.vessels).toMatchObject([{ route: "Rockaway-Soundview", source: "schedule" }]);
    expect(sched.terminals.features).toHaveLength(1);
    const live = toFerryData({ routes: [{ gtfsId: "FERRY:RS", shortName: "RS", longName: "Rockaway-Soundview", color: null, patterns: [{ ...pattern, vehiclePositions: [{ vehicleId: "v1", label: null, lat: 40.65, lon: -73.95, heading: 90, lastUpdated: 1190 }] }] }] }, 1200);
    expect(live.vessels).toEqual([{ id: "v1", route: "Rockaway-Soundview", lon: -73.95, lat: 40.65, heading: 90, source: "live" }]);
  });
});
