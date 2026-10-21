import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bearingToZ, distanceM, frameAt, localMatrix, localMatrixYUp, metersPerPixel, toLocal } from "./projection";

const NYC: [number, number] = [-73.99, 40.73];
const M_PER_DEG_LAT = 111_195; // MapLibre's earth radius (6,371,008.8 m)

describe("three/projection", () => {
  it("puts the origin at 0,0 and measures metres east and north", () => {
    const f = frameAt(NYC);
    const [ox, oy] = toLocal(f, ...NYC);
    expect(Math.abs(ox) + Math.abs(oy)).toBe(0);
    const [x, y] = toLocal(f, NYC[0], NYC[1] + 100 / M_PER_DEG_LAT);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(100, 0); // north is +y
    const [ex, ey] = toLocal(f, NYC[0] + 100 / (M_PER_DEG_LAT * Math.cos((NYC[1] * Math.PI) / 180)), NYC[1]);
    expect(ex).toBeCloseTo(100, 0); // east is +x
    expect(ey).toBeCloseTo(0, 6);
  });

  it("agrees with MapLibre's ground distance within a few cm at street scale", () => {
    const f = frameAt(NYC);
    const p: [number, number] = [-73.9875, 40.7316];
    const [x, y] = toLocal(f, ...p);
    expect(Math.abs(Math.hypot(x, y) - distanceM(...NYC, ...p))).toBeLessThan(0.05 * Math.hypot(x, y) / 100 + 0.05);
  });

  it("maps local metres back onto the same mercator point (z-up and y-up frames)", () => {
    const f = frameAt(NYC);
    const p: [number, number] = [-73.995, 40.728];
    const [x, y] = toLocal(f, ...p);
    const want = frameAt(p).origin;
    const zUp = new THREE.Vector3(x, y, 0).applyMatrix4(localMatrix(f));
    expect(zUp.x).toBeCloseTo(want.x, 12);
    expect(zUp.y).toBeCloseTo(want.y, 12);
    const yUp = new THREE.Vector3(x, 0, -y).applyMatrix4(localMatrixYUp(f)); // y-up: z is south
    expect(yUp.x).toBeCloseTo(want.x, 12);
    expect(yUp.y).toBeCloseTo(want.y, 12);
    // 10 m up is 10 m of mercator altitude in both frames.
    expect(new THREE.Vector3(0, 0, 10).applyMatrix4(localMatrix(f)).z).toBeCloseTo(10 * f.s, 15);
    expect(new THREE.Vector3(0, 10, 0).applyMatrix4(localMatrixYUp(f)).z).toBeCloseTo(10 * f.s, 15);
  });

  it("turns a compass bearing into a clockwise rotation about +z", () => {
    const fwd = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), bearingToZ(90));
    expect(fwd.x).toBeCloseTo(1); // 90° = east
    expect(fwd.y).toBeCloseTo(0);
  });

  it("gives ground metres per pixel for 512 px tiles", () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78_271.517, 3);
    expect(metersPerPixel(NYC[1], 17)).toBeCloseTo(0.4525, 3);
  });
});
