import { describe, expect, it } from "vitest";
import { commuteFor, commuteOf, commutePrompt, delayOn, readHomeWork, readUsual, rememberCommute, SAVED_PLACES_KEY, usualFromTrip, type HomeWork } from "./commute";
import type { Trip } from "./schema";

const home = { label: "Astoria", lon: -73.92, lat: 40.77 };
const work = { label: "Midtown", lon: -73.98, lat: 40.754 };
const places: HomeWork = { home, work };

function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

const ride = (route: string, color?: string) => ({ kind: "ride" as const, route, label: route, coords: [[-73.92, 40.77], [-73.98, 40.754]] as Array<[number, number]>, durationS: 900, stops: [], underground: true, geometrySource: "gtfs-shape" as const, mode: "subway" as const, color });
const core = (route: string, mins: number) => ({
  id: route,
  mode: "transit" as const,
  origin: { label: "Home", at: [-73.921, 40.771] as [number, number] },
  destination: { label: "Work", at: [-73.981, 40.7545] as [number, number] },
  departIso: "2026-10-24T08:30:00Z",
  arriveIso: new Date(Date.parse("2026-10-24T08:30:00Z") + mins * 60_000).toISOString(),
  legs: [ride(route, "#2850ad")],
  routes: [route],
  alerts: [], elevators: [], hazards: [], weather: null, exitAdvice: null, context: [], skips: [], stubbed: [],
});
const trip = { ...core("N", 24), alternatives: [core("N", 30), core("R", 28)] } as unknown as Trip;

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

  it("knows a trip between Home and Work and keeps its line and other lines", () => {
    expect(commuteOf(trip, places)).toBe("work");
    expect(commuteOf(trip, { home, work: null })).toBeNull();
    expect(usualFromTrip(trip)).toEqual({ route: "N", color: "#2850ad", minutes: 24, alternatives: [{ route: "R", color: "#2850ad", minutes: 28 }] });
    const s = mem({ [SAVED_PLACES_KEY]: JSON.stringify(places) });
    expect(rememberCommute(trip, s)).toBe("work");
    expect(readUsual("work", s)?.route).toBe("N");
    expect(readUsual("home", s)).toBeNull();
  });

  it("turns a delay alert into minutes and a plain cause", () => {
    const alerts = [
      { id: "1", kind: "planned", text: "[N] runs local", routes: ["N"] },
      { id: "2", kind: "delay", text: "Northbound [N] trains are running with delays of about 8 minutes while we address a signal problem at 42 St.", routes: ["N", "Q"] },
    ];
    expect(delayOn(alerts, "N")).toEqual({ route: "N", minutes: 8, cause: "Signal problem at 42 St" });
    expect(delayOn(alerts, "R")).toBeNull();
    expect(delayOn([{ id: "4", kind: "delay", text: "[A][H] trains are delayed in both directions while the South Channel Bridge opens.", routes: ["A", "H"] }], "H")?.cause).toBe("South Channel Bridge opens");
    expect(delayOn([{ id: "3", kind: "delay", text: "[A] trains are delayed.", routes: ["A"] }], "A")).toEqual({ route: "A", minutes: null, cause: "A trains are delayed" });
  });

  it("asks the planner with both ends, a line or a later start", () => {
    expect(commutePrompt("work", places)).toBe("Plan my trip from Home (Astoria) at 40.7700, -73.9200 to Work (Midtown) at 40.7540, -73.9800, leaving now.");
    expect(commutePrompt("home", places, { via: "R" })).toContain("from Work (Midtown)");
    expect(commutePrompt("home", places, { via: "R" })).toContain("taking the R train");
    expect(commutePrompt("work", places, { leaveAt: new Date("2026-10-24T13:10:00Z") })).toContain("leaving at 9:10 AM");
    expect(commutePrompt("work", { home, work: null })).toBeNull();
  });
});
