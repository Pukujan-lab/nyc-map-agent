import { describe, expect, it } from "vitest";
import { northAngle, project, unproject, type MiniView } from "./miniMap";

const v: MiniView = { lon: -73.9857, lat: 40.7484, bearing: 0, radiusM: 250, radiusPx: 80 };
const north = (m: number) => v.lat + m / 111_320;
const east = (m: number) => v.lon + m / (111_320 * Math.cos((v.lat * Math.PI) / 180));

describe("mini map", () => {
  it("puts what is ahead straight up the disc", () => {
    const p = project(v, v.lon, north(125));
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(-40, 6);
    expect(p.d).toBeCloseTo(125, 3);
  });
  it("rotates heading-up: facing east, east is up and north is left", () => {
    const e = { ...v, bearing: 90 };
    expect(project(e, east(250), v.lat).y).toBeCloseTo(-80, 6);
    expect(project(e, v.lon, north(250)).x).toBeCloseTo(-80, 6);
  });
  it("unprojects a tap back to the same place", () => {
    const e = { ...v, bearing: 37 };
    const p = project(e, east(60), north(-90));
    const back = unproject(e, p.x, p.y);
    expect(back.lon).toBeCloseTo(east(60), 9);
    expect(back.lat).toBeCloseTo(north(-90), 9);
  });
  it("keeps the N marker on the rim opposite the heading", () => {
    expect(northAngle(0)).toBe(-0);
    expect(northAngle(90)).toBeCloseTo(-Math.PI / 2, 9);
  });
});
