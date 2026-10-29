import { describe, expect, it } from "vitest";
import { blocksQuery } from "./queries";

describe("blocksQuery", () => {
  it("binds every user value as a parameter", () => {
    const { sql, params } = blocksQuery({
      source: "noise'; drop table x;--",
      window: "90d",
      level: "nta",
      categories: ["Noise - Residential"],
      severity: ["injury"],
      borough: "brooklyn",
    });
    expect(sql).not.toContain("drop table");
    expect(sql).toContain("b.category = ANY($3::text[])");
    expect(sql).toContain("b.severity = ANY($4::text[])");
    expect(sql).toContain("a.borough = $5");
    expect(params).toEqual(["noise'; drop table x;--", "90 days", ["Noise - Residential"], ["injury"], "BROOKLYN"]);
  });

  it("returns block coordinates only at block level and keeps unmapped blocks", () => {
    const block = blocksQuery({ source: "trees", window: "12mo", level: "block" });
    expect(block.sql).toContain("min(b.r) AS r");
    expect(block.sql).toContain("LEFT JOIN core.block_areas");
    const cd = blocksQuery({ source: "trees", window: "12mo", level: "cd" });
    expect(cd.sql).toContain("a.boro_cd::text AS area");
    expect(cd.sql).not.toContain("LEFT JOIN");
  });

  it("reads real tax blocks at taxblock level (#120)", () => {
    const { sql, params } = blocksQuery({ source: "trees", window: "12mo", level: "taxblock", categories: ["Oak"], borough: "staten island", nta: "SI0101" });
    expect(sql).toContain("FROM marts.taxblock_month t");
    expect(sql).toContain("t.block_id::text AS area");
    expect(sql).toContain("t.category = ANY($3::text[])");
    // Staten Island's tax blocks are 500000-599999.
    expect(sql).toContain("t.block_id / 100000 = $4");
    expect(sql).toContain("t.nta2020 = $5");
    expect(params).toEqual(["trees", "12 months", ["Oak"], 5, "SI0101"]);
  });
});
