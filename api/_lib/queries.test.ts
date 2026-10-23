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

  it("serves block-keyed sources by tax block id at block level only", () => {
    const { sql, params } = blocksQuery({ source: "311", window: "90d", level: "block", borough: "Brooklyn", nta: "BK0101" });
    expect(sql).toContain("FROM raw.source_block_cells");
    expect(sql).toContain("JOIN core.tax_blocks");
    expect(sql).not.toContain("block_month");
    expect(sql).toContain("k.boro = $3");
    expect(sql).toContain("k.nta2020 = $4");
    expect(params).toEqual(["311", "90 days", 3, "BK0101"]);
    expect(blocksQuery({ source: "311", window: "90d", level: "nta" }).sql).toContain("marts.block_month");
    expect(blocksQuery({ source: "trees", window: "90d", level: "block" }).sql).toContain("marts.block_month");
  });
});
