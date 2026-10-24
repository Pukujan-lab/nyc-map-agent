import { describe, expect, it } from "vitest";
import { VEHICLE_MODELS, hasVehicleModel, showVehicleModel } from "./threeLayer";

describe("vehicle body", () => {
  it("keeps the route-coloured box unless 3D buildings are on and eco is off", () => {
    expect(showVehicleModel(false, "flat")).toBe(false);
    expect(showVehicleModel(true, "3d")).toBe(false);
    expect(showVehicleModel(true, "flat")).toBe(false);
    expect(showVehicleModel(false, "3d")).toBe(true);
  });

  it("never loads a train model: trains are route-coloured boxes (#366)", () => {
    expect(hasVehicleModel("subway")).toBe(false);
    expect(hasVehicleModel("rail")).toBe(false);
    expect(hasVehicleModel("bus")).toBe(true);
    expect(Object.values(VEHICLE_MODELS).map((m) => m?.url)).toEqual(["/api/vehicle-models/bus"]);
  });
});
