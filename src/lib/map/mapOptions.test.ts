import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, lineOpacity, readOptions } from "./mapOptions";

describe("map options", () => {
  it("default to simple streets, names and flat buildings", () => {
    expect(readOptions({ getItem: () => null })).toEqual(DEFAULT_OPTIONS);
    expect(readOptions({ getItem: () => JSON.stringify({ streets: "full", routes: ["L", 3] }) })).toMatchObject({ streets: "full", routes: ["L"] });
  });
  it("hides roads only when that choice is saved", () => {
    expect(readOptions({ getItem: () => null }).roads).toBe(true);
    expect(readOptions({ getItem: () => JSON.stringify({ roads: false }) }).roads).toBe(false);
  });
  it("shows bus stops only when that choice is saved", () => {
    expect(readOptions({ getItem: () => null }).busStops).toBe(false);
    expect(readOptions({ getItem: () => JSON.stringify({ busStops: true }) }).busStops).toBe(true);
  });
  it("keeps 3D buildings only when chosen", () => {
    expect(readOptions({ getItem: () => JSON.stringify({ buildings: "3d" }) }).buildings).toBe("3d");
    expect(readOptions({ getItem: () => JSON.stringify({ buildings: true }) }).buildings).toBe("flat");
  });
  it("mutes lines until picked or focused", () => {
    expect(lineOpacity([], false)).toBe(0.5);
    expect(lineOpacity([], true)).toBe(1);
    expect(lineOpacity(["L"], false)).toEqual(["case", ["in", ["get", "route"], ["literal", ["L"]]], 1, 0.12]);
  });
});
