import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, lineOpacity, readOptions } from "./mapOptions";

describe("map options", () => {
  it("default to simple streets with names and buildings", () => {
    expect(readOptions({ getItem: () => null })).toEqual(DEFAULT_OPTIONS);
    expect(readOptions({ getItem: () => JSON.stringify({ streets: "full", routes: ["L", 3] }) })).toMatchObject({ streets: "full", routes: ["L"] });
  });
  it("mutes lines until picked or focused", () => {
    expect(lineOpacity([], false)).toBe(0.5);
    expect(lineOpacity([], true)).toBe(1);
    expect(lineOpacity(["L"], false)).toEqual(["case", ["in", ["get", "route"], ["literal", ["L"]]], 1, 0.12]);
  });
});
