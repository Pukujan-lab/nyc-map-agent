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

import { raisedTrack } from "./model";
describe("raised track", () => {
  it("puts a deck at bridge height and no piers on the bridge", () => {
    const c: Array<[number, number]> = [[-73.9944, 40.7136], [-73.9906, 40.7075], [-73.9862, 40.7032]];
    const s = { ...sys, shapes: { B: { c, m: [0, 740, 1340], g: ["underground", "underground", "underground"] } } } as unknown as StaticSystem;
    const r = raisedTrack(s);
    expect(r.decks.features.length).toBe(2);
    expect(r.decks.features[0].properties?.top).toBe(40);
    expect(r.piers.features.length).toBe(0);
  });
});

describe("viaductBays", () => {
  it("stamps 15 m bays along elevated track, skipping bridges and flagging stations", async () => {
    const { viaductBays } = await import("./model");
    const c: Array<[number, number]> = [[-73.96, 40.70], [-73.96, 40.7018]]; // ~200 m due north
    const sys = { system: "subway", routes: {}, lines: { type: "FeatureCollection", features: [] }, stopM: {},
      stations: { type: "FeatureCollection", features: [{ type: "Feature", properties: { id: "s", name: "S", routes: "J" }, geometry: { type: "Point", coordinates: [-73.96, 40.7009] } }] },
      shapes: { J: { c, m: [0, 200], g: ["elevated", "elevated"] } } } as never;
    const bays = viaductBays(sys);
    expect(bays.length).toBeGreaterThanOrEqual(13);
    expect(bays.every((b) => b.top === 8 && Math.round(b.bearing) % 360 === 0)).toBe(true);
    expect(bays.some((b) => b.station)).toBe(true);
    expect(bays.some((b) => !b.station)).toBe(true);
  });
});

describe("entranceInstances", () => {
  it("culls to radius, faces the station, and grays only out-of-service elevators", async () => {
    const { entranceInstances } = await import("./model");
    const pt = (lon: number, lat: number, props: object) => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: [lon, lat] } });
    const sys = { system: "subway", routes: {}, shapes: {}, stopM: {}, lines: { type: "FeatureCollection", features: [] },
      stations: { type: "FeatureCollection", features: [pt(-73.99, 40.7310, { id: "S", name: "S", routes: "" })] },
      entrances: { type: "FeatureCollection", features: [pt(-73.99, 40.7300, { id: "S", name: "S", kind: "Stair" }), pt(-73.99, 40.7301, { id: "S", name: "S", kind: "Elevator" }), pt(-73.99, 40.7302, { id: "S", name: "S", kind: "Easement - Street" }), pt(-73.95, 40.73, { id: "S", name: "S", kind: "Stair" })] } } as never;
    const e = entranceInstances(sys, new Set(["S"]), [-73.99, 40.73]);
    expect(e.map((x) => [x.kind, x.out])).toEqual([["stair", false], ["elevator", true]]);
    expect(Math.round(e[0].bearing)).toBe(0);
  });
});

describe("x-ray", () => {
  it("parses OSM levels and builds stacked primitives, red elevators when out", async () => {
    const { parseLevel } = await import("./model");
    const { xrayPrims } = await import("./xray");
    expect(parseLevel("-2")).toEqual([-2, -2]);
    expect(parseLevel("-1;0")).toEqual([-1, 0]);
    expect(parseLevel(undefined, -1)).toEqual([-1, -1]);
    const p = xrayPrims({ ways: [{ k: "platform", c: [[0, 0], [0, 1]], from: -2, to: -2 }, { k: "steps", c: [[0, 0], [1, 0]], from: -2, to: -1 }], elevators: [{ lon: 0, lat: 0, from: -2 }] }, [[0, 0]], true);
    expect(p[0].pts[0][2]).toBe(-10);
    expect(p[1].pts.map((q) => q[2])).toEqual([-10, -5]);
    expect(p.find((q) => q.kind === "shaft" && q.width > 1)?.color).toBe("#ef4444");
  });
});
