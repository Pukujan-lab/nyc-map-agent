import { describe, expect, it } from "vitest";
import { busRoutesOfTrip, busesToShow, holdShuttle, registerBusToggle, revealTripBuses, setShuttleBuses, setTripBuses } from "./busReveal";

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
});
