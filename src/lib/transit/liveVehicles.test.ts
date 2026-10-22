import { describe, expect, it } from "vitest";
import { dotsNear, type LiveDot } from "./liveVehicles";

describe("dotsNear", () => {
  it("keeps vehicles inside the radius only", () => {
    const list: LiveDot[] = [
      { key: "a", lon: -73.99, lat: 40.735, color: "#f00", bus: false, underground: true },
      { key: "b", lon: -73.95, lat: 40.735, color: "#00f", bus: true, underground: false },
    ];
    const fc = dotsNear(list, -73.99, 40.7355, 600);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toMatchObject({ color: "#f00", under: true });
  });
});
