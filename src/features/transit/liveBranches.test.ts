import { describe, expect, it } from "vitest";
import { liveBranches } from "./liveBranches";
import type { LiveTrip, StaticSystem } from "./model";

// A made-up line F: a trunk S1-S2, then two ways to S5, through S3 (north) or through S4 (south).
// The G runs S5-S6-S7 on its own track; S1-S2 is about 1 km.
const P: Record<string, [number, number]> = {
  S1: [-74.0, 40.7], S2: [-73.988, 40.7], S3: [-73.976, 40.705], S4: [-73.976, 40.695], S5: [-73.964, 40.7], S6: [-73.952, 40.7], S7: [-73.94, 40.7], Q: [-73.982, 40.7],
};
const feature = (route: string, ids: string[], grade = "underground") => ({
  type: "Feature" as const, properties: { route, color: route === "F" ? "#EB6800" : "#6CBE45", grade }, geometry: { type: "LineString" as const, coordinates: ids.map((id) => P[id]) },
});
const sys = {
  system: "subway", routes: {}, shapes: {}, stopM: {},
  lines: { type: "FeatureCollection", features: [
    // The north way is cut by grade into two features, as the real data is.
    feature("F", ["S1", "S2", "S3"]), feature("F", ["S3", "S5"], "elevated"),
    feature("F", ["S1", "S2", "S4", "S5"]),
    feature("G", ["S5", "S6", "S7"]),
  ] },
  stations: { type: "FeatureCollection", features: ["S1", "S2", "S3", "S4", "S5", "S6", "S7"].map((id) => ({ type: "Feature", properties: { id, name: id, routes: "F" }, geometry: { type: "Point", coordinates: P[id] } })) },
} as unknown as StaticSystem;
const trip = (route: string, ids: string[]): LiveTrip => ({ id: ids.join("-"), route, dir: 0, stops: ids.map((id, i) => [`${id}S`, 1000 + i * 60]) });
const lengthKm = (fs: GeoJSON.Feature<GeoJSON.LineString>[]) => fs.reduce((n, f) => n + f.geometry.coordinates.slice(1).reduce((d, c, i) => d + Math.hypot((c[0] - f.geometry.coordinates[i][0]) * 84.4, (c[1] - f.geometry.coordinates[i][1]) * 111.2), 0), 0);
const through = (fs: GeoJSON.Feature<GeoJSON.LineString>[], id: string) => fs.some((f) => f.geometry.coordinates.some((c) => c[0] === P[id][0] && c[1] === P[id][1]));

describe("liveBranches", () => {
  it("draws the way the trains go in use and fades the other", () => {
    const b = liveBranches("F", sys, [trip("F", ["S1", "S2", "S4", "S5"]), trip("F", ["S2", "S4", "S5"])])!;
    expect(through(b.unused, "S3")).toBe(true);
    expect(through(b.used, "S4")).toBe(true);
    expect(through(b.used, "S3")).toBe(false);
    // The shared trunk is in use, only the north way is faded.
    expect(lengthKm(b.unused)).toBeLessThan(lengthKm(b.used));
    expect(b.detour).toEqual([]);
  });

  it("a branch past the last stop the trains make is faded, not drawn as theirs", () => {
    // Trains turn at S5: the G's track beyond is not the F's, and the F's own run past S2 toward S1 is unused.
    const b = liveBranches("F", sys, [trip("F", ["S2", "S4", "S5"])])!;
    expect(through(b.unused, "S1")).toBe(true);
    expect(through(b.used, "S1")).toBe(false);
  });

  it("an express run uses the track past the stations it skips", () => {
    const b = liveBranches("F", sys, [trip("F", ["S1", "S4", "S5"]), trip("F", ["S1", "S4"])])!;
    expect(through(b.used, "S2")).toBe(true);
    expect(b.detour).toEqual([]);
  });

  it("a timing point between stations is not a station", () => {
    const b = liveBranches("F", sys, [trip("F", ["S1", "S2", "T99", "S4", "S5"])])!;
    expect(through(b.used, "S4")).toBe(true);
    expect(through(b.used, "S3")).toBe(false);
  });

  it("a run off the line's own track is a detour along the track it is on", () => {
    const b = liveBranches("F", sys, [trip("F", ["S2", "S4", "S5", "S6", "S7"])])!;
    expect(b.detour).toHaveLength(2);
    expect(through(b.detour, "S6")).toBe(true);
    expect(b.detour[0].properties?.color).toBe("#EB6800");
  });

  it("says nothing with no trains on the line", () => {
    expect(liveBranches("F", sys, [])).toBeNull();
    expect(liveBranches("F", sys, [trip("G", ["S5", "S6", "S7"])])).toBeNull();
  });
});
