import { describe, expect, it } from "vitest";
import { LEGACY_LIGHT, movedM, REBUILD_M } from "./core";

describe("three core", () => {
  it("measures camera moves in metres, so a turn of the head never rebuilds a layer", () => {
    const a = { lng: -73.9857, lat: 40.758 };
    expect(movedM(a, a)).toBe(0);
    // 0.0001° of latitude is about 11 m.
    expect(movedM(a, { lng: a.lng, lat: a.lat + 0.0001 })).toBeCloseTo(11.1, 0);
    expect(movedM(a, { lng: a.lng, lat: a.lat + 0.0001 })).toBeLessThan(REBUILD_M);
  });

  it("scales lights by π, as three 0.134's legacy mode did", () => {
    expect(LEGACY_LIGHT).toBeCloseTo(Math.PI);
  });
});
