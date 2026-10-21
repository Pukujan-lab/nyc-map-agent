import { describe, expect, it } from "vitest";
import { arrivalsAt, estimateTrain, type StaticSystem } from "./model";

const sys: StaticSystem = {
  system: "subway",
  routes: { G: { name: "Crosstown", short: "G", color: "#6CBE45", text: "#FFFFFF" } },
  lines: { type: "FeatureCollection", features: [] },
  stations: { type: "FeatureCollection", features: [] },
  shapes: { G: { c: [[-73.95, 40.7], [-73.95, 40.71]], m: [0, 1113], g: ["underground", "underground"] } },
  stopM: { G: { A: 0, B: 1113 } },
};

describe("transit model", () => {
  it("interpolates between the passed and next stop", () => {
    const v = estimateTrain(sys, { id: "t", route: "G", dir: 0, stops: [["AN", 100], ["BN", 200]] }, 150)!;
    expect(v.lat).toBeCloseTo(40.705, 4);
    expect(v.bearing).toBeCloseTo(0, 0);
    expect(v.grade).toBe("underground");
  });
  it("groups arrivals by line and direction", () => {
    const a = arrivalsAt("subway", { at: 0, trips: [{ id: "t", route: "G", dir: 0, stops: [["BN", 300], ["BS", 400]] }] }, "B", 0);
    expect(a.map((x) => x.direction)).toEqual(["Downtown", "Uptown"]);
  });
});

import { trackHeightProfile } from "./model";
describe("track height profile", () => {
  it("ramps up to the Manhattan Bridge deck and back down", () => {
    const c: Array<[number, number]> = [[-74.0, 40.718], [-73.9944, 40.7136], [-73.9906, 40.7075], [-73.9862, 40.7032], [-73.98, 40.69]];
    const m = [0, 700, 1440, 2040, 3500];
    const s = { ...sys, shapes: { B: { c, m, g: ["underground", "underground", "underground", "underground", "underground"] as const } } } as unknown as StaticSystem;
    const p = trackHeightProfile(s, "B")!;
    expect(p.h[2]).toBe(40);
    expect(p.h[0]).toBeLessThan(40);
    expect(p.grade[2]).toBe("elevated");
  });
});
