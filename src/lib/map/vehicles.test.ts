import { describe, expect, it } from "vitest";
import { showVehicleModel } from "./threeLayer";

describe("vehicle body", () => {
  it("keeps the route-coloured box unless 3D buildings are on and eco is off", () => {
    expect(showVehicleModel(false, "flat")).toBe(false);
    expect(showVehicleModel(true, "3d")).toBe(false);
    expect(showVehicleModel(true, "flat")).toBe(false);
    expect(showVehicleModel(false, "3d")).toBe(true);
  });
});
