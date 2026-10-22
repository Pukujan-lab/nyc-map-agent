import { describe, expect, it } from "vitest";
import { parseAt, shortStreet, streetLabel, streetPosition } from "./streetPos";

// Grand St runs ~east-west, Essex St ~north-south, crossing near (-73.9883, 40.7180).
const grand = { name: "Grand Street", coords: [[-73.992, 40.7183], [-73.985, 40.7177]] as Array<[number, number]> };
const essex = { name: "Essex Street", coords: [[-73.9886, 40.7150], [-73.9880, 40.7210]] as Array<[number, number]> };
const far = { name: "Delancey Street", coords: [[-73.992, 40.7193], [-73.985, 40.7187]] as Array<[number, number]> };

describe("streetPosition", () => {
  it("names the street underfoot and the nearby cross street", () => {
    const p = streetPosition([grand, essex, far], -73.9890, 40.71805);
    expect(streetLabel(p)).toBe("Grand St & Essex St");
  });
  it("drops a cross street beyond 80 m", () => {
    const p = streetPosition([grand, essex], -73.9915, 40.71826);
    expect(p).toEqual({ street: "Grand St", cross: null });
  });
  it("returns null far from any street", () => {
    expect(streetPosition([grand], -73.95, 40.75)).toBeNull();
  });
  it("shortens sign words", () => {
    expect(shortStreet("West 44th Street")).toBe("W 44th St");
    expect(shortStreet("Avenue A")).toBe("Av A");
  });
});

describe("parseAt", () => {
  it("reads lon,lat,bearing inside NYC only", () => {
    expect(parseAt("-73.989,40.718,90")).toEqual({ lon: -73.989, lat: 40.718, bearing: 90 });
    expect(parseAt("-73.989,40.718")).toEqual({ lon: -73.989, lat: 40.718, bearing: 0 });
    expect(parseAt("0,0")).toBeNull();
    expect(parseAt(null)).toBeNull();
  });
});
