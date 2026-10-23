import { describe, expect, it } from "vitest";
import { sumByBlock } from "./block-join";
import { fineCellSelect, rowsToPoints, toBlockCountRows, toTaxBlockRows } from "./block-counts";

describe("block counts", () => {
  it("rolls points to ~11 m cells in SoQL", () => {
    expect(fineCellSelect({ lat: "latitude", lon: "longitude" })).toBe(
      "floor(latitude * 10000) AS r, floor(longitude * 10000) AS c, count(*) AS n",
    );
    expect(fineCellSelect({ lat: "y", lon: "x", castNumber: true })).toContain("floor(y::number * 10000)");
  });

  it("turns cells into weighted centre points and drops junk", () => {
    const pts = rowsToPoints([
      { r: "407000", c: "-739000", n: "5" },
      { r: "x", c: "1", n: "1" },
      { r: "1", c: "1", n: "0" },
    ]);
    expect(pts).toHaveLength(1);
    expect(pts[0]?.lat).toBeCloseTo(40.70005, 6);
    expect(pts[0]?.lon).toBeCloseTo(-73.89995, 6);
    expect(pts[0]?.n).toBe(5);
  });

  it("sums per block, ignoring non-positive or non-finite entries", () => {
    const m = sumByBlock([{ id: 300585, n: 2 }, { id: "300585", n: "3" }, { id: 1, n: 0 }, { id: "a", n: 1 }]);
    expect([...m.entries()]).toEqual([[300585, 5]]);
  });

  it("orders rows largest first and splits block ids into boro and block", () => {
    const rows = toBlockCountRows("311", "2026-09-01", new Map([[100001, 2], [300585, 9]]));
    expect(rows.map((r) => r.block_id)).toEqual([300585, 100001]);
    const [tb] = toTaxBlockRows([{ id: 300585, label: "L", nta2020: "", west: 1, south: 2, east: 3, north: 4, areaM2: 5 }]);
    expect(tb).toMatchObject({ boro: 3, block: 585, nta2020: null });
  });
});
