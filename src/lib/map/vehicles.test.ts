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
  it("keeps the tapered box outline, painted, with a dark windshield at the front", () => {
    for (const livery of ["local", "sbs", "express"] as const) {
      const g = busGeometry(livery);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      expect(b.max.y - b.min.y).toBeCloseTo(12, 5);
      expect(b.max.x - b.min.x).toBeCloseTo(2.6, 5);
      expect(b.max.z).toBeCloseTo(3.2, 5);
      expect(g.hasAttribute("color")).toBe(true);
    }
  });

  it("paints locals navy, SBS light blue and express white from above", () => {
    const roof = (livery: "local" | "sbs" | "express") => {
      const g = busGeometry(livery);
      const c = g.attributes.color, p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) if (n.getZ(i) > 0.5 && p.getY(i) < 0) return [c.getX(i), c.getY(i), c.getZ(i)];
      return [];
    };
    const [lr, , lb] = roof("local"), [sr, sg, sb] = roof("sbs"), [er, eg] = roof("express");
    expect(lb).toBeGreaterThan(lr * 2);
    expect(sb).toBeGreaterThan(sr);
    expect(sg).toBeGreaterThan(0.5);
    expect(er).toBeGreaterThan(0.85);
    expect(eg).toBeGreaterThan(0.85);
  });
});
