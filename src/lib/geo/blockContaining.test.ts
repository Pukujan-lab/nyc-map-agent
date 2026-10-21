import { describe, expect, it } from "vitest";
import { blockContaining } from "./blocks";

const sq = (key: string, w: number, s: number, e: number, n: number) => ({ key, polygon: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] as [number, number][][] });

describe("blockContaining", () => {
  // Real blocks are keyed by tax-block id ("202835"), not the 0.003° grid, so
  // the eye-level tap has to find its block by shape.
  const blocks = [sq("101223", -73.99, 40.738, -73.988, 40.74), sq("202835", -73.988, 40.738, -73.986, 40.74)];
  it("finds the block whose polygon holds the point", () => {
    expect(blockContaining(blocks, -73.9874, 40.7391)?.key).toBe("202835");
    expect(blockContaining(blocks, -73.989, 40.739)?.key).toBe("101223");
  });
  it("returns undefined outside every block and inside a hole", () => {
    expect(blockContaining(blocks, -73.98, 40.739)).toBeUndefined();
    const holed = [{ key: "h", polygon: [...sq("x", 0, 0, 10, 10).polygon, ...sq("y", 4, 4, 6, 6).polygon] }];
    expect(blockContaining(holed, 5, 5)).toBeUndefined();
    expect(blockContaining(holed, 2, 2)?.key).toBe("h");
  });
});
