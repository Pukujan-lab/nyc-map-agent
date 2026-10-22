import { describe, expect, it } from "vitest";
import { decodePolyline, itineraryToTrip, rankItineraries, stopName, type OtpItinerary } from "./otp";
import { planTrip } from "./plan";
import type { StationEntrances, TransitPlanner } from "./transit";

const noStations: StationEntrances = { stations: () => Promise.resolve([]), entrances: () => Promise.resolve([]) };
const t = (h: string) => `2026-10-23T${h}:00-04:00`;
const pt = (name: string, lon: number, lat: number, stop = false) => ({ name, lon, lat, stop: stop ? { gtfsId: `X:${name}`, name } : null });
const time = (h: string) => ({ scheduledTime: t(h), estimated: null });
function walk(a: ReturnType<typeof pt>, b: ReturnType<typeof pt>, s: string, e: string) {
  return { mode: "WALK", duration: 300, distance: 400, start: time(s), end: time(e), from: a, to: b, route: null, legGeometry: null, intermediateStops: null, steps: [] };
}
function ride(route: string, mode: string, a: ReturnType<typeof pt>, b: ReturnType<typeof pt>, s: string, e: string, n = 3) {
  return { mode, duration: 1800, distance: 9000, realTime: false, headsign: "Rockaway Park", start: time(s), end: time(e), from: a, to: b,
    route: { gtfsId: `F:${route}`, shortName: route, longName: null, color: "0039A6" }, legGeometry: null,
    intermediateStops: Array.from({ length: n }, (_, i) => ({ name: `S${i}`, lat: 40.6, lon: -73.8 })), steps: [] };
}
const home = pt("Origin", -73.882, 40.742), beach = pt("Destination", -73.8197, 40.5833);
const busIt: OtpItinerary = { start: t("09:02"), end: t("10:00"), duration: 3480, numberOfTransfers: 0, walkDistance: 800, legs: [
  walk(home, pt("Broadway/Elmhurst Av", -73.881, 40.743, true), "09:02", "09:07"),
  ride("Q53-SBS", "BUS", pt("Broadway/Elmhurst Av", -73.881, 40.743, true), pt("Beach 98 St", -73.82, 40.585, true), "09:10", "09:52", 12),
  walk(pt("Beach 98 St", -73.82, 40.585, true), beach, "09:52", "10:00"),
] };
const subIt: OtpItinerary = { ...busIt, end: t("10:20"), numberOfTransfers: 1, legs: [
  walk(home, pt("Elmhurst Av", -73.882, 40.742, true), "09:00", "09:04"),
  ride("R", "SUBWAY", pt("Elmhurst Av", -73.882, 40.742, true), pt("Jay St", -73.98, 40.69, true), "09:05", "09:40"),
  ride("A", "SUBWAY", pt("Jay St", -73.98, 40.69, true), pt("Beach 98 St", -73.82, 40.585, true), "09:45", "10:12"),
  walk(pt("Beach 98 St", -73.82, 40.585, true), beach, "10:12", "10:20"),
] };

describe("OTP glue", () => {
  it("decodes a Google polyline as [lon, lat]", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC")).toEqual([[-120.2, 38.5], [-120.95, 40.7]]);
  });
  it("title-cases upper-case bus stop names", () => {
    expect(stopName("ROCKAWAY BEACH BLVD/BEACH 96 ST")).toBe("Rockaway Beach Blvd/Beach 96 St");
    expect(stopName("Jay St-MetroTech")).toBe("Jay St-MetroTech");
  });
  it("ranks by arrival, then transfers, then walking, one per route sequence", () => {
    const sameArrival = { ...subIt, end: busIt.end };
    expect(rankItineraries([subIt, busIt, { ...busIt }]).map((i) => i.end)).toEqual([busIt.end, subIt.end]);
    expect(rankItineraries([sameArrival, busIt])[0]).toBe(busIt);
  });
  it("maps a bus leg with bullet, stops and a final walk FROM the stop", async () => {
    const trip = await itineraryToTrip(busIt, { label: "Elmhurst Av", at: [-73.882, 40.742] }, { label: "Rockaway Beach", at: [-73.8197, 40.5833] }, noStations);
    const r = trip.legs.find((l) => l.kind === "ride");
    expect(r).toMatchObject({ route: "Q53+", mode: "bus", fromStop: "Broadway/Elmhurst Av", toStop: "Beach 98 St", numStops: 13 });
    expect(trip.legs.at(-1)?.label).toBe("Walk from Beach 98 St to Rockaway Beach");
    expect(trip.arriveIso).toBe("2026-10-23T10:00");
  });
  it("returns alternatives and falls back to the subway router when OTP is down", async () => {
    const o = { label: "A", at: [-73.882, 40.742] as [number, number] }, d = { label: "B", at: [-73.8197, 40.5833] as [number, number] };
    const ok = await planTrip(o, d, "2026-10-23T09:00", false, { otp: { plan: () => Promise.resolve([subIt, busIt]) }, entrances: noStations });
    expect(ok.planner).toBe("otp");
    expect(ok.routes).toEqual(["Q53+"]);
    expect(ok.alternatives.map((a) => a.routes)).toEqual([["R", "A"]]);
    const none: TransitPlanner = { plan: () => Promise.resolve(null) };
    const down = await planTrip(o, d, "2026-10-23T09:00", false, { otp: { plan: () => Promise.reject(new Error("down")) }, planner: none, entrances: noStations });
    expect(down.planner).toBe("fallback");
  });
});
