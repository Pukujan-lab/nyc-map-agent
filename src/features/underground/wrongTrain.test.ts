import { describe, expect, it } from "vitest";
import type { Pt, SubwayStatic } from "./exits";
import { dirStep, initialDir, justSurfaced, nextStationAhead, plannedExit, wrongDirectionLine, wrongExit, type DirState } from "./wrongTrain";

const UNION_SQ: Pt = [-73.98995, 40.73467];
const ASTOR: Pt = [-73.99107, 40.73005];
const BARUCH: Pt = [-73.9866, 40.73986];
const GRAND_CENTRAL: Pt = [-73.97685, 40.75178];
const sys = {
  stations: { features: [
    { geometry: { coordinates: UNION_SQ }, properties: { id: "635", name: "14 St-Union Sq", routes: "4 5 6" } },
    { geometry: { coordinates: ASTOR }, properties: { id: "636", name: "Astor Pl", routes: "6" } },
    { geometry: { coordinates: BARUCH }, properties: { id: "634", name: "23 St-Baruch College", routes: "6" } },
  ] },
} as unknown as SubwayStatic;
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const ride = (pts: Pt[], s: DirState = initialDir) => pts.reduce((st, p) => dirStep(st, UNION_SQ, GRAND_CENTRAL, p, 120), s);

describe("riding the wrong way", () => {
  it("says nothing on the uptown 6 to Grand Central", () => {
    const s = ride([UNION_SQ, lerp(UNION_SQ, BARUCH, 0.5), BARUCH]);
    expect(s.boarded).toBe(true);
    expect(s.wrong).toBe(false);
  });

  it("warns on the downtown 6, naming the station ahead and the way it goes", () => {
    const s = ride([UNION_SQ, lerp(UNION_SQ, ASTOR, 0.3), lerp(UNION_SQ, ASTOR, 0.6), lerp(UNION_SQ, ASTOR, 0.9)]);
    expect(s.wrong).toBe(true);
    const next = nextStationAhead(sys, "6", lerp(UNION_SQ, ASTOR, 0.6), s.travel!);
    expect(next?.name).toBe("Astor Pl");
    expect(wrongDirectionLine(s.travel, next?.name ?? null)).toBe("This train is going downtown. Get off at Astor Pl and cross over.");
  });

  it("clears once you cross over and head back, and ignores fixes before boarding or too vague", () => {
    const wrong = ride([UNION_SQ, lerp(UNION_SQ, ASTOR, 0.5), ASTOR]);
    expect(wrong.wrong).toBe(true);
    expect(ride([lerp(ASTOR, UNION_SQ, 0.3)], wrong).wrong).toBe(false);
    expect(ride([ASTOR, lerp(ASTOR, [-73.993, 40.725], 0.5)]).boarded).toBe(false);
    expect(dirStep(initialDir, UNION_SQ, GRAND_CENTRAL, UNION_SQ, 900)).toBe(initialDir);
  });
});

describe("coming up at another exit", () => {
  it("knows the first sharp fix after vague ones", () => {
    expect(justSurfaced([8, 120, 120, 120, 8])).toBe(true);
    expect(justSurfaced([8, 120, 120, 120, 8, 8])).toBe(false);
    expect(justSurfaced([8, 120, 8])).toBe(false);
  });

  it("flags only an exit more than 150 m from the planned one", () => {
    expect(wrongExit(GRAND_CENTRAL, lerp(GRAND_CENTRAL, BARUCH, 0.01))).toBeNull();
    expect(wrongExit(GRAND_CENTRAL, lerp(GRAND_CENTRAL, BARUCH, 0.2))).toBeGreaterThan(150);
    expect(wrongExit(null, BARUCH)).toBeNull();
  });
});

describe("the ?sim=wrongway pretend trip", () => {
  it("rides the 6 downtown while the trip goes uptown, and the warning fires before Astor Pl", async () => {
    const { readFileSync } = await import("node:fs");
    const { buildSimWrongWay, simTrip } = await import("@/lib/geo/simWalk");
    const data = JSON.parse(readFileSync("public/transit/subway.json", "utf8")) as Parameters<typeof simTrip>[0];
    const trip = simTrip(data);
    expect(trip.legs[1].stops?.at(-1)?.text).toBe("Grand Central-42 St");
    const from: Pt = [trip.legs[0].station!.lon, trip.legs[0].station!.lat];
    const to = trip.legs[1].stops!.at(-1)!.at;
    let s = initialDir;
    let firedAt: Pt | null = null;
    for (const x of buildSimWrongWay(data)) {
      s = dirStep(s, from, to, x.at, x.accuracy);
      if (s.wrong && !firedAt) firedAt = x.at;
    }
    expect(firedAt).not.toBeNull();
    expect(firedAt![1]).toBeLessThan(UNION_SQ[1]);
    expect(plannedExit(trip)).toEqual([-73.97594, 40.75129]);
  });
});
