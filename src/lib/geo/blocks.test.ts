import { describe, expect, it } from "vitest";
import { bboxPolygon } from "./blocks";
import { blockName } from "@/lib/layers";

describe("real blocks", () => {
  it("frames a block's bounds as a closed ring", () => {
    expect(bboxPolygon([-74, 40.7, -73.99, 40.71])[0]).toEqual([
      [-74, 40.7], [-73.99, 40.7], [-73.99, 40.71], [-74, 40.71], [-74, 40.7],
    ]);
  });
  it("names a tax block by its label and falls back to the grid square", () => {
    expect(blockName({ label: "Brooklyn block 585 · COURT STREET" })).toBe("Brooklyn block 585 · COURT STREET");
    expect(blockName({})).toBe("~300 m block");
  });
});
