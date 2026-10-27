import { describe, expect, it } from "vitest";
import type { StaticSystem } from "./model";
import { lineStops, otherLine, pointAt, shapeM, stepAlong } from "./lineSteps";

// A straight north-south line of three stations 1 km apart, with a second line at the middle one.
const station = (id: string, lat: number, routes: string) => ({ type: "Feature" as const, properties: { id, name: id, routes }, geometry: { type: "Point" as const, coordinates: [-74, lat] } });
const sys = {
  system: "subway",
  routes: {},
  lines: { type: "FeatureCollection", features: [] },
  stations: { type: "FeatureCollection", features: [station("S1", 40.7, "N"), station("S2", 40.709, "N Q R"), station("S3", 40.718, "N")] },
  shapes: { N: { c: [[-74, 40.7], [-74, 40.709], [-74, 40.718]], m: [0, 1000, 2000], g: ["underground", "underground", "underground"] } },
  stopM: { N: { S1: 0, S2: 1000, S3: 2000 }, Q: { S2: 0 }, R: { S2: 0 } },
} as unknown as StaticSystem;

describe("lineSteps", () => {
  it("orders stations and trains along the track", () => {
    const stops = lineStops(sys, "N", [{ key: "t1", lon: -74, lat: 40.7046 }]);
    expect(stops.map((s) => s.id)).toEqual(["S1", "t1", "S2", "S3"]);
  });

  it("steps to a train between stations first, otherwise the next station", () => {
    const stops = lineStops(sys, "N", [{ key: "t1", lon: -74, lat: 40.7046 }]);
    expect(stepAlong(stops, { id: "S1", m: 0 }, 1)?.id).toBe("t1");
    expect(stepAlong(stops, { id: "t1", m: 500 }, 1)?.id).toBe("S2");
    expect(stepAlong(stops, { id: "S2", m: 1000 }, -1)?.id).toBe("t1");
    expect(stepAlong(stops, { id: "S3", m: 2000 }, 1)).toBeNull();
  });

  it("starts from the nearest place on the line when nothing is focused", () => {
    const stops = lineStops(sys, "N", []);
    expect(stepAlong(stops, { id: null, m: 1500 }, 1)?.id).toBe("S3");
    expect(stepAlong(stops, { id: null, m: 1500 }, -1)?.id).toBe("S2");
  });

  it("puts a point on the shape and back", () => {
    expect(shapeM(sys.shapes.N, [-74.0001, 40.709])).toBeCloseTo(1000, 0);
    expect(pointAt(sys.shapes.N, 500)[1]).toBeCloseTo(40.7045, 4);
  });

  it("cycles the other lines at a station, and none where there is one", () => {
    expect(otherLine(sys, "S2", "N", 1)).toEqual({ route: "Q", station: "S2" });
    expect(otherLine(sys, "S2", "N", -1)).toEqual({ route: "R", station: "S2" });
    expect(otherLine(sys, "S1", "N", 1)).toBeNull();
  });

  it("counts the other platforms of a complex", () => {
    const complex = structuredClone(sys) as unknown as StaticSystem;
    complex.stations.features.push({ type: "Feature", properties: { id: "X1", name: "S1", routes: "2 3" }, geometry: { type: "Point", coordinates: [-74.001, 40.7005] } });
    complex.stopM["2"] = { X1: 0 };
    complex.stopM["3"] = { X1: 0 };
    expect(otherLine(complex, "S1", "N", 1)).toEqual({ route: "2", station: "X1" });
    expect(otherLine(complex, "S1", "N", -1)).toEqual({ route: "3", station: "X1" });
  });
});
