import { describe, expect, it } from "vitest";
import { serviceChanges } from "../../../src/lib/transit/serviceChanges";
import type { TripCore } from "../../../src/features/agent/schema";
import { avoidFor, platformNotes, tripImpacts } from "./trip";
import type { Station } from "./transit";

const st = (name: string, lon: number): Station => ({ id: name, complexId: name, name, routes: ["7"], structure: "Elevated", at: [lon, 40.745] });
const flushing = st("Flushing-Main St", -73.83), s69 = st("69 St", -73.896), s52 = st("52 St", -73.912), woodside = st("61 St-Woodside", -73.903), qbp = st("Queensboro Plaza", -73.94);
const all = [flushing, s69, s52, woodside, qbp];
const changes = serviceChanges({ id: "a", routes: ["7"], text: "In Queens, Flushing-bound [7] skips 52 St and 69 St\nAll trains at Woodside-61 St board from the Manhattan-bound platform" });

describe("trip planning around direction-aware skips", () => {
  const avoid = avoidFor(changes, all);
  it("avoids 69 St and 52 St for Flushing-bound rides", () => {
    expect(avoid(s69, "7", qbp, s69)).toBe(true); // exit at 69 St heading to Flushing
    expect(avoid(s52, "7", s52, flushing)).toBe(true); // board at 52 St heading to Flushing
  });
  it("keeps them for Manhattan-bound rides", () => {
    expect(avoid(s69, "7", s69, qbp)).toBe(false);
    expect(avoid(s52, "7", flushing, s52)).toBe(false);
  });
  it("adds the platform notice only for the moved direction at Woodside", () => {
    expect(platformNotes(changes, woodside, "7", woodside, flushing, all)).toEqual(["Flushing-bound trains board from the Manhattan-bound platform"]);
    expect(platformNotes(changes, woodside, "7", woodside, qbp, all)).toEqual([]);
  });
});

describe("trip impacts of a suspended stretch", () => {
  const s = (name: string, lon: number, lat: number): Station => ({ id: name, complexId: name, name, routes: ["7"], structure: "Subway", at: [lon, lat] });
  const hy = s("34 St-Hudson Yards", -74.002, 40.7555), ts = s("Times Sq-42 St", -73.9871, 40.7553), gc = s("Grand Central-42 St", -73.9768, 40.7514), q = s("Queensboro Plaza", -73.9402, 40.7509), fl = s("Flushing-Main St", -73.8303, 40.7596);
  const stations = [hy, ts, gc, q, fl];
  const gap = serviceChanges({ id: "g", routes: ["7"], text: "No [7] between Queensboro Plaza, Queens and 34 St-Hudson Yards, Manhattan" });
  const trip = (a: Station, b: Station) => ({ legs: [{ kind: "ride", mode: "subway", route: "7", label: "", coords: [a.at, b.at], durationS: 600, stops: [], underground: true, geometrySource: "straight-line", fromStop: a.name, toStop: b.name }] }) as unknown as TripCore;
  it("blocks a ride inside the gap", () => {
    expect(tripImpacts(trip(gc, ts), gap, stations)).toEqual([{ route: "7", text: "No 7 trains between Queensboro Plaza and 34 St-Hudson Yards, and this ride uses that stretch.", blocks: true }]);
  });
  it("leaves a ride that only reaches the gap's end", () => {
    expect(tripImpacts(trip(fl, q), gap, stations)).toEqual([]);
  });
});
