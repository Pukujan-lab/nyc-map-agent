import { afterEach, describe, expect, it } from "vitest";
import { currentOrigin, directionsPair, directionsQuestion, walkOnly } from "./directionsFromHere";
import { setWalkEye } from "@/lib/map/walkEye";

afterEach(() => setWalkEye(null));

describe("currentOrigin", () => {
  it("prefers the street-view eye over a missing shared location", () => {
    expect(currentOrigin()).toBeNull();
    setWalkEye({ lon: -73.99, lat: 40.73 });
    expect(currentOrigin()).toEqual({ lon: -73.99, lat: 40.73 });
  });
});

describe("directionsPair", () => {
  it("needs both ends", () => {
    const dest = { lon: -73.98, lat: 40.75 };
    expect(directionsPair(null, dest)).toBeNull();
    expect(directionsPair({ lon: -73.99, lat: 40.73 }, dest)).toEqual({
      start: { lon: -73.99, lat: 40.73 },
      end: dest,
    });
  });
});

describe("Directions from here, near or far", () => {
  it("walks a short way and asks the planner for anything farther", () => {
    const here = { lon: -73.9832, lat: 40.7536 };
    expect(walkOnly(here, { lon: -73.9850, lat: 40.7550 })).toBe(true);
    expect(walkOnly(here, { lon: -73.8786, lat: 40.7366 })).toBe(false);
    expect(walkOnly(null, { lon: -73.9850, lat: 40.7550 })).toBe(false);
  });

  it("names the place and its exact spot for the planner", () => {
    expect(directionsQuestion({ lon: -73.9787, lat: 40.758741 }, "Rockefeller Center")).toBe("How do I get to Rockefeller Center (40.75874, -73.97870)?");
    expect(directionsQuestion({ lon: -73.9787, lat: 40.758741 })).toBe("How do I get to this spot (40.75874, -73.97870)?");
  });
});
