import { describe, expect, it } from "vitest";
import { ELMHURST, fakeCoords } from "./devGeo";

describe("development fake location", () => {
  it("is Elmhurst in development and never in production", () => {
    expect(fakeCoords(undefined, true)).toEqual(ELMHURST);
    expect(fakeCoords(undefined, false)).toBeNull();
    expect(fakeCoords("-73.99,40.73", false)).toBeNull();
  });

  it("can be moved or turned off", () => {
    expect(fakeCoords("-73.99,40.73", true)).toEqual({ lon: -73.99, lat: 40.73 });
    expect(fakeCoords("off", true)).toBeNull();
  });
});
