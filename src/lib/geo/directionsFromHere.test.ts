import { afterEach, describe, expect, it } from "vitest";
import { currentOrigin, directionsPair } from "./directionsFromHere";
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
