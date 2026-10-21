import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, lineOpacity, readOptions } from "./mapOptions";

describe("map options", () => {
  it("default to simple streets, names and flat buildings", () => {
    expect(readOptions({ getItem: () => null })).toEqual(DEFAULT_OPTIONS);
    expect(readOptions({ getItem: () => JSON.stringify({ streets: "full", routes: ["L", 3] }) })).toMatchObject({ streets: "full", routes: ["L"] });
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

describe("station names option", () => {
  it("is on by default and remembers off", () => {
    expect(readOptions({ getItem: () => null }).stationNames).toBe(true);
    expect(readOptions({ getItem: () => JSON.stringify({ stationNames: false }) }).stationNames).toBe(false);
  });
});
