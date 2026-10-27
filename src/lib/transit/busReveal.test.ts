import { describe, expect, it } from "vitest";
import { busRoutesOfTrip, busesInFocus, busesToShow, clearStopWatch, watchStopBuses, capPerLine, parseBusCap, parseBusLines, holdShuttle, registerBusToggle, revealTripBuses, setShuttleBuses, setTripBuses, shownVehicles } from "./busReveal";

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

describe("which buses are in focus", () => {
  // 5 Av / 53 St, and points about 0.5 km and 8 km north of it.
  const here = { lon: -73.9755, lat: 40.7605 };
  const bus = (id: string, route: string, dLat: number) => ({ id, route, lon: here.lon, lat: here.lat + dLat });
  const fleet = [bus("a", "M4", 0.0045), bus("b", "M4", 0.07), bus("c", "SIM10", 0.07), bus("d", "M1", 0.004), bus("e", "Q58", 0)];
  const ids = (list: { id: string }[]) => list.map((b) => b.id).sort();

  it("picked routes show up to the cap per line, nearest first, citywide", () => {
    expect(ids(busesInFocus(fleet, { routes: ["M4", "SIM10"], nearOnly: false, cap: 3, near: here }))).toEqual(["a", "b", "c"]);
    expect(ids(busesInFocus(fleet, { routes: ["M4"], nearOnly: false, cap: 1, near: here }))).toEqual(["a"]);
  });

  it("routes found near you show only their nearby buses, so zooming out does not fill the city", () => {
    expect(ids(busesInFocus(fleet, { routes: ["M1", "M4", "SIM10"], nearOnly: true, cap: 3, near: here }))).toEqual(["a", "d"]);
  });

  it("keeps the followed bus even when it is far, and drops routes that are not on", () => {
    expect(ids(busesInFocus(fleet, { routes: ["M4"], nearOnly: true, cap: 3, near: here, keep: new Set(["b"]) }))).toEqual(["a", "b"]);
  });

  it("out of focus with no point to be near shows only the kept bus", () => {
    expect(ids(busesInFocus(fleet, { routes: ["M4"], nearOnly: true, cap: 3, near: null, keep: new Set(["b"]) }))).toEqual(["b"]);
  });
});

describe("a bus stop's see-them-coming", () => {
  it("puts the stop's routes ahead of picked lines and a trip, turns buses on, and gives them back when closed", () => {
    let on = 0;
    registerBusToggle(() => { on += 1; });
    const at = { lon: -73.95, lat: 40.71 };
    watchStopBuses({ routes: ["b62"], at, panelId: "busstop:x" });
    expect(on).toBe(1);
    expect(busesToShow(["M4"], { trip: ["Q58"], shuttle: null, watch: { routes: ["B62"], at, panelId: "busstop:x" } })).toEqual({ why: "watch", routes: ["B62"] });
    clearStopWatch();
    expect(busesToShow(["M4"], { trip: null, shuttle: null, watch: null })).toEqual({ why: "page", routes: ["M4"] });
    registerBusToggle(null);
  });
});
