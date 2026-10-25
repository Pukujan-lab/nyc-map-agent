import { describe, expect, it } from "vitest";
import { busRoutesOfTrip, busesToShow, capPerLine, parseBusCap, parseBusLines, holdShuttle, registerBusToggle, revealTripBuses, setShuttleBuses, setTripBuses, shownVehicles } from "./busReveal";

const leg = (route: string, mode: "bus" | "subway") => ({ kind: "ride", route, mode });

function trip(routes: Array<[string, "bus" | "subway"]>, alts: string[][] = []) {
  return {
    legs: routes.map(([r, mode]) => leg(r, mode)),
    alternatives: alts.map((rs) => ({ legs: rs.map((r) => leg(r, "bus")) })),
  };
}

describe("which buses a trip reveals", () => {
  it("takes the bus legs and an alternative's bus, and ignores the subway leg", () => {
    expect(busRoutesOfTrip(trip([["6", "subway"], ["Q44+", "bus"]], [["M15+"]]))).toEqual(["Q44+", "M15+"]);
  });

  it("stops at one page of routes", () => {
    const many = Array.from({ length: 25 }, (_, i) => [`Q${i + 1}`, "bus"] as [string, "bus"]);
    expect(busRoutesOfTrip(trip(many))).toHaveLength(20);
  });

  it("turns buses on for a bus trip and leaves a walking trip alone", () => {
    let calls = 0;
    registerBusToggle(() => { calls += 1; });
    revealTripBuses(trip([["6", "subway"]]));
    expect(calls).toBe(0);
    expect(busesToShow(["M1"])).toEqual({ why: "page", routes: ["M1"] });
    revealTripBuses(trip([["Q44+", "bus"]]));
    expect(calls).toBe(1);
    expect(busesToShow(["M1"])).toEqual({ why: "trip", routes: ["Q44+"] });
    registerBusToggle(null);
    setTripBuses([]);
  });

  it("lets a shuttle replace the page, and Live buses off keeps that shuttle hidden", () => {
    setTripBuses(["Q44+"]);
    expect(busesToShow(["M1"])).toEqual({ why: "trip", routes: ["Q44+"] });
    expect(setShuttleBuses("a1", ["T102"])).toBe(true);
    expect(busesToShow(["M1"]).why).toBe("shuttle");
    expect(setShuttleBuses("a1", ["T102"])).toBe(true);
    holdShuttle("a1");
    expect(busesToShow(["M1"])).toEqual({ why: "page", routes: ["M1"] });
    expect(setShuttleBuses("a1", ["T102"])).toBe(false);
    expect(busesToShow([])).toEqual({ why: "off", routes: [] });
    setTripBuses([]);
    setShuttleBuses(null, []);
  });

  it("drops every bus when live buses is off and keeps the train", () => {
    const train = { system: "subway", route: "M" };
    const bus = { system: "bus", route: "Q1" };
    expect(shownVehicles([train, bus], [])).toEqual([train]);
    expect(shownVehicles([train, bus], ["q1"])).toEqual([train, bus]);
    expect(shownVehicles([train, bus], ["B44"])).toEqual([train]);
  });
});

describe("picking bus lines and capping buses per line", () => {
  it("cleans the list: upper case, no repeats, at most 20", () => {
    expect(parseBusLines(" q1, B41,q1,,m15 ")).toEqual(["Q1", "B41", "M15"]);
    expect(parseBusLines(null)).toEqual([]);
    expect(parseBusLines(Array.from({ length: 30 }, (_, i) => `Q${i + 1}`).join(","))).toHaveLength(20);
  });

  it("keeps buses per line between 1 and 10 and defaults to 3", () => {
    expect(parseBusCap(null)).toBe(3);
    expect(parseBusCap("0")).toBe(3);
    expect(parseBusCap("abc")).toBe(3);
    expect(parseBusCap("2")).toBe(2);
    expect(parseBusCap("99")).toBe(10);
  });

  it("keeps the nearest buses on each line and leaves a short line whole", () => {
    const at = (route: string, lon: number) => ({ route, lon, lat: 40.7 });
    const buses = [at("Q1", -73.9), at("Q1", -73.5), at("Q1", -73.81), at("Q1", -73.8), at("B41", -74)];
    const out = capPerLine(buses, 2, { lon: -73.8, lat: 40.7 });
    expect(out.filter((b) => b.route === "Q1").map((b) => b.lon)).toEqual([-73.8, -73.81]);
    expect(out.filter((b) => b.route === "B41")).toHaveLength(1);
    expect(capPerLine(buses, 2)).toHaveLength(3);
  });
});
