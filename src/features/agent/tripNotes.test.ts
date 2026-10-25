import { describe, expect, it } from "vitest";
import { tripToGeoJson } from "./tripLayer";
import type { Trip } from "./schema";

const ride = (route: string, from: [number, number], to: [number, number], fromStop: string) => ({ kind: "ride" as const, route, label: route, coords: [from, to], durationS: 300, stops: [], underground: true, geometrySource: "gtfs-shape" as const, mode: "subway" as const, fromStop });
const trip = {
  id: "t", mode: "transit", origin: { label: "Union Sq", at: [-73.99, 40.735] }, destination: { label: "Flushing", at: [-73.83, 40.76] },
  departIso: "2026-10-26T18:00", arriveIso: "2026-10-26T18:50",
  legs: [ride("4", [-73.99, 40.735], [-73.977, 40.752], "14 St-Union Sq"), ride("7", [-73.977, 40.752], [-73.83, 40.76], "Grand Central-42 St")],
  routes: ["4", "7"], alerts: [], elevators: [], hazards: [], weather: null, exitAdvice: null, context: [],
  skips: [{ route: "7", name: "33 St-Rawson St", at: [-73.93, 40.745], toward: null }], stubbed: [], alternatives: [],
} as unknown as Trip;

describe("trip notes on the route", () => {
  it("marks where to change trains and the stations the trip's lines skip", () => {
    const notes = tripToGeoJson(trip).features.filter((f) => f.properties?.note).map((f) => f.properties);
    expect(notes).toEqual([
      { note: "transfer", label: "Change to the 7 · Grand Central-42 St" },
      { note: "skip", label: "7 · Skipped: 33 St-Rawson St" },
    ]);
  });
});
