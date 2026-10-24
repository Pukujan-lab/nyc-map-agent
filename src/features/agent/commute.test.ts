import { describe, expect, it } from "vitest";
import { commuteFor, commuteOf, commutePrompt, delayDetails, delayOn, lineAlert, readHomeWork, readUsual, rememberCommute, SAVED_PLACES_KEY, stationPoints, subwayStations, usualFromTrip, type HomeWork } from "./commute";
import type { Trip } from "./schema";

const home = { label: "Astoria", lon: -73.92, lat: 40.77 };
const work = { label: "Midtown", lon: -73.98, lat: 40.754 };
const places: HomeWork = { home, work };

function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

const ride = (route: string, color?: string, fromStop?: string, toStop?: string) => ({ kind: "ride" as const, route, label: route, coords: [[-73.92, 40.77], [-73.98, 40.754]] as Array<[number, number]>, durationS: 900, stops: [], underground: true, geometrySource: "gtfs-shape" as const, mode: "subway" as const, color, fromStop, toStop });
const core = (route: string, mins: number, legs = [ride(route, "#2850ad", "Astoria Blvd")]) => ({
  id: route,
  mode: "transit" as const,
  origin: { label: "Home", at: [-73.921, 40.771] as [number, number] },
  destination: { label: "Work", at: [-73.981, 40.7545] as [number, number] },
  departIso: "2026-10-24T08:30:00Z",
  arriveIso: new Date(Date.parse("2026-10-24T08:30:00Z") + mins * 60_000).toISOString(),
  legs,
  routes: [route],
  alerts: [], elevators: [], hazards: [], weather: null, exitAdvice: null, context: [], skips: [], stubbed: [],
});
const trip = { ...core("N", 24), alternatives: [core("N", 30), core("R", 28, [ride("R", "#2850ad", "Steinway St", "Queensboro Plaza"), ride("7", "#b933ad", "Queensboro Plaza")])] } as unknown as Trip;

describe("daily commute", () => {
  it("goes to Work before noon and Home from noon", () => {
    expect(commuteFor(7)).toBe("work");
    expect(commuteFor(11)).toBe("work");
    expect(commuteFor(12)).toBe("home");
    expect(commuteFor(19)).toBe("home");
  });

  it("reads #327's saved spots and drops bad ones", () => {
    const s = mem({ [SAVED_PLACES_KEY]: JSON.stringify({ home, work: { label: "Paris", lon: 2.35, lat: 48.85 } }) });
    expect(readHomeWork(s)).toEqual({ home, work: null });
    expect(readHomeWork(mem({ [SAVED_PLACES_KEY]: "{oops" }))).toEqual({ home: null, work: null });
  });

  it("knows a trip between Home and Work and keeps its line, boarding stop and transfers", () => {
    expect(commuteOf(trip, places)).toBe("work");
    expect(commuteOf(trip, { home, work: null })).toBeNull();
    expect(usualFromTrip(trip)).toEqual({
      route: "N",
      color: "#2850ad",
      minutes: 24,
      board: "Astoria Blvd",
      transfers: [],
      alternatives: [{ route: "R", color: "#2850ad", minutes: 28, board: "Steinway St", transfers: ["Change at Queensboro Plaza to the 7"] }],
    });
    const s = mem({ [SAVED_PLACES_KEY]: JSON.stringify(places) });
    expect(rememberCommute(trip, s)).toBe("work");
    expect(readUsual("work", s)?.route).toBe("N");
    expect(readUsual("home", s)).toBeNull();
  });

  it("turns a delay alert into minutes and a plain cause", () => {
    const alerts = [
      { id: "1", kind: "planned", text: "[N] runs local", routes: ["N"] },
      { id: "2", kind: "delay", text: "Northbound [N] trains are running with delays of about 8 minutes while we address a signal problem at 42 St.", routes: ["N", "Q"] },
    ].map((a) => lineAlert.parse(a));
    expect(delayOn(alerts, "N")).toEqual({ route: "N", minutes: 8, cause: "Signal problem at 42 St" });
    expect(delayOn(alerts, "R")).toBeNull();
    expect(delayOn([lineAlert.parse({ id: "4", kind: "delay", text: "[A][H] trains are delayed in both directions while the South Channel Bridge opens.", routes: ["A", "H"] })], "H")?.cause).toBe("South Channel Bridge opens");
    expect(delayOn([lineAlert.parse({ id: "3", kind: "delay", text: "[A] trains are delayed.", routes: ["A"] })], "A")).toEqual({ route: "A", minutes: null, cause: "A trains are delayed" });
  });

  it("expands a delay into its window, the lines it touches and how, from the feed only", () => {
    const now = Date.parse("2026-10-24T13:00:00Z");
    const alerts = [
      { id: "d", kind: "delay", text: "[A][C] trains are running with delays while we address a signal problem at 42 St-Port Authority.", routes: ["A", "C"], start: now / 1000 - 600, direction: "Uptown", stops: ["A27N"] },
      { id: "s", kind: "planned", text: "[A] skips 50 St", routes: ["A"], start: now / 1000 - 3600, end: now / 1000 + 3600, changes: [{ route: "A", kind: "skip", names: ["50 St"], notice: "Skipped in both directions" }] },
      { id: "r", kind: "planned", text: "[E] via [F]", routes: ["E"], via: ["F"] },
      { id: "later", kind: "planned", text: "[A] skips 23 St", routes: ["A"], start: now / 1000 + 86400, changes: [{ route: "A", kind: "skip", names: ["23 St"], notice: "" }] },
    ].map((a) => lineAlert.parse(a));
    const d = delayDetails(alerts, "A", now)!;
    expect(d.since).toBe("Sat 8:50 AM");
    expect(d.until).toBeNull();
    // The E has no alert on this line, and tomorrow's skip is not active: both are left out.
    expect(d.effects).toEqual([
      { route: "A", how: "slower, Uptown" },
      { route: "C", how: "slower, Uptown" },
      { route: "A", how: "skips 50 St" },
    ]);
    expect(d.stations).toEqual(["42 St-Port Authority", "50 St"]);
    expect(d.stopIds).toEqual(["A27N"]);
    expect(delayDetails(alerts, "Q", now)).toBeNull();

    const sys = subwayStations.parse({
      stations: {
        features: [
          { geometry: { coordinates: [-73.989, 40.757] }, properties: { id: "A27", name: "42 St-Port Authority Bus Terminal" } },
          { geometry: { coordinates: [-73.985, 40.762] }, properties: { id: "A25", name: "50 St" } },
        ],
      },
    });
    expect(stationPoints(sys, d)).toEqual([
      { at: [-73.989, 40.757], name: "42 St-Port Authority Bus Terminal" },
      { at: [-73.985, 40.762], name: "50 St" },
    ]);
  });

  it("asks the planner with both ends, another line, and to show the transfer", () => {
    expect(commutePrompt("work", places)).toBe("Plan my trip from Home (Astoria) at 40.7700, -73.9200 to Work (Midtown) at 40.7540, -73.9800, leaving now.");
    expect(commutePrompt("home", places, { via: "R" })).toContain("from Work (Midtown)");
    expect(commutePrompt("home", places, { via: "R" })).toContain("taking the R train");
    expect(commutePrompt("work", places, { via: "R", showTransfer: true })).toMatch(/Show me where to board and the transfer on the map\.$/);
    expect(commutePrompt("work", { home, work: null })).toBeNull();
  });
});
