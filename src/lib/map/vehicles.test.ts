import { describe, expect, it } from "vitest";
import { VEHICLE_MODELS, busGeometry, hasVehicleModel, showVehicleModel } from "./threeLayer";

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
    expect(hasVehicleModel("bus")).toBe(false);
    expect(Object.values(VEHICLE_MODELS)).toEqual([]);
  });
});

describe("bus body", () => {
  it("is a 12 m bus facing +y with its livery in vertex colours, cheap enough to instance", () => {
    const g = busGeometry();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.y - b.min.y).toBeCloseTo(12.1, 1);
    expect(b.max.y).toBeGreaterThan(-b.min.y); // the destination sign sticks out at the front
    expect(b.max.z).toBeLessThan(3.2);
    expect(g.hasAttribute("color")).toBe(true);
    expect(g.index!.count / 3).toBeLessThanOrEqual(150);
  });
});
