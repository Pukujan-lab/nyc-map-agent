import { describe, expect, it } from "vitest";
import { stationRowId } from "@/lib/transit/bullets";
import { rowBulletAt } from "./rowBullet";

describe("rowBulletAt", () => {
  const row = stationRowId(["B", "D", "N", "Q", "R", "W"]);
  const st = { x: 100, y: 100 };
  // Six bullets at size 1: 98 px wide, from x 51 to 149, y 106 to 124.
  it("names the bullet under the tap", () => {
    expect(rowBulletAt(row, st, { x: 60, y: 115 }, 1)).toBe("B");
    expect(rowBulletAt(row, st, { x: 92, y: 115 }, 1)).toBe("N");
    expect(rowBulletAt(row, st, { x: 145, y: 115 }, 1)).toBe("W");
  });
  it("scales with the icon size", () => {
    expect(rowBulletAt(row, st, { x: 100 - 49 * 1.35 + 5, y: 100 + 6 * 1.35 + 10 }, 1.35)).toBe("B");
  });
  it("ignores taps above the row (the station itself) or beside it", () => {
    expect(rowBulletAt(row, st, { x: 100, y: 95 }, 1)).toBeNull();
    expect(rowBulletAt(row, st, { x: 170, y: 115 }, 1)).toBeNull();
    expect(rowBulletAt("", st, { x: 100, y: 115 }, 1)).toBeNull();
  });
});
