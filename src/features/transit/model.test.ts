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
  it("is half way between stops mid-way through the travel time after its dwell", () => {
    const v = estimateTrain(sys, { id: "t", route: "G", dir: 0, stops: [["AN", 100], ["BN", 200]] }, 165)!;
    expect(v.lat).toBeCloseTo(40.705, 4);
    expect(v.bearing).toBeCloseTo(0, 0);
    expect(v.grade).toBe("underground");
  });
  it("groups arrivals by line and direction", () => {
    const a = arrivalsAt("subway", { at: 0, trips: [{ id: "t", route: "G", dir: 0, stops: [["BN", 300], ["BS", 400]] }] }, "B", 0);
    expect(a.map((x) => x.direction)).toEqual(["Downtown", "Uptown"]);
  });
});

import { readFileSync } from "node:fs";
import { dedupeTrackLines, trackHeightProfile } from "./model";
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
describe("myrtle viaduct", () => {
  it("lifts the Middle Village terminal onto the viaduct", () => {
    const c: Array<[number, number]> = [[-73.8896, 40.7114], [-73.8906, 40.7091], [-73.8937, 40.7067]];
    const s = { ...sys, shapes: { M: { c, m: [0, 280, 560], g: ["grade", "grade", "underground"] as const } } } as unknown as StaticSystem;
    const p = trackHeightProfile(s, "M")!;
    expect(p.grade).toEqual(["elevated", "elevated", "elevated"]);
    expect(p.h[0]).toBe(8);
    expect(p.h[2]).toBe(8);
  });
});

describe("open terminal tails", () => {
  it("lifts a short underground pocket that opens onto elevated track", () => {
    const c: Array<[number, number]> = [[-73.83, 40.76], [-73.834, 40.758], [-73.84, 40.756]];
    const s = { ...sys, shapes: { 7: { c, m: [0, 370, 1100], g: ["underground", "underground", "elevated"] as const } } } as unknown as StaticSystem;
    const p = trackHeightProfile(s, "7")!;
    expect(p.grade[0]).toBe("elevated");
    expect(p.h[0]).toBe(8);
  });
  it("leaves a long tunnel approach underground", () => {
    const c: Array<[number, number]> = [[-74.0, 40.75], [-73.95, 40.75], [-73.9, 40.75]];
    const s = { ...sys, shapes: { 7: { c, m: [0, 4200, 8400], g: ["underground", "underground", "elevated"] as const } } } as unknown as StaticSystem;
    const p = trackHeightProfile(s, "7")!;
    expect(p.grade[0]).toBe("underground");
    expect(p.h[0]).toBe(0);
  });
  it("puts the 7 at Flushing–Main St and the 3 at Harlem–148 St on the viaduct", () => {
    const raw = JSON.parse(readFileSync("public/transit/subway.json", "utf8")) as StaticSystem;
    const sub = { ...raw, system: "subway" as const };
    const seven = trackHeightProfile(sub, "7")!;
    const three = trackHeightProfile(sub, "3")!;
    const sir = trackHeightProfile(sub, "SI")!;
    expect(seven.grade[0]).toBe("elevated");
    expect(seven.h[0]).toBe(8);
    expect(seven.grade[400]).toBe("underground");
    expect(seven.h[400]).toBe(0);
    expect(three.grade.at(-1)).toBe("elevated");
    expect(three.h.at(-1)).toBe(8);
    expect(sir.grade[0]).not.toBe("underground");
  });
});

const track = (grade: string, coords: Array<[number, number]>, route = "A"): GeoJSON.Feature<GeoJSON.LineString> => ({
  type: "Feature",
  properties: { route, color: "#0062CF", grade },
  geometry: { type: "LineString", coordinates: coords },
});

describe("deduped track lines", () => {
  const trunk: Array<[number, number]> = [[-73.9, 40.67], [-73.89, 40.67], [-73.88, 40.67]];
  it("draws a stacked trunk once and keeps a branch that leaves it", () => {
    const out = dedupeTrackLines([
      track("underground", trunk),
      track("underground", trunk, "C"),
      track("underground", [...trunk].reverse()),
      track("underground", [[-73.9, 40.67], [-73.89, 40.67], [-73.88, 40.66]]),
    ]);
    expect(out).toHaveLength(2);
    expect(out.some((f) => f.geometry.coordinates.at(-1)?.[1] === 40.66)).toBe(true);
  });
  it("does not fold the elevated run into the underground dash", () => {
    const out = dedupeTrackLines([
      track("underground", trunk),
      track("elevated", [[-73.88, 40.67], [-73.87, 40.67]]),
    ]);
    expect(out.map((f) => (f.properties as { grade: string }).grade).sort()).toEqual(["elevated", "underground"]);
  });
  it("draws the shared Fulton trunk once and keeps the Rockaway branch", () => {
    const raw = JSON.parse(readFileSync("public/transit/subway.json", "utf8")) as { lines: { features: GeoJSON.Feature<GeoJSON.LineString>[] } };
    const before = raw.lines.features.filter((f) => f.properties!.color === "#0062CF" && f.properties!.grade === "underground" && f.geometry.coordinates.some((p) => Math.abs(p[0] + 73.87211) < 0.0004 && Math.abs(p[1] - 40.67538) < 0.0004));
    const out = dedupeTrackLines(raw.lines.features);
    const at = (lon: number, lat: number, grade: string) => out.filter((f) => f.properties!.color === "#0062CF" && f.properties!.grade === grade && f.geometry.coordinates.some((p) => Math.abs(p[0] - lon) < 0.0004 && Math.abs(p[1] - lat) < 0.0004));
    expect(before.length).toBeGreaterThan(1);
    expect(at(-73.87211, 40.67538, "underground")).toHaveLength(1);
    expect(at(-73.85899, 40.67937, "elevated")).toHaveLength(1);
    expect(out.some((f) => f.properties!.color === "#0062CF" && f.geometry.coordinates.some((p) => p[1] < 40.65))).toBe(true);
  });
});

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
