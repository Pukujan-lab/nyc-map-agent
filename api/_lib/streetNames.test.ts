import { describe, expect, it } from "vitest";
import { mergeStreetRows, streetVariants, type StreetRow } from "./streetNames";

describe("streetVariants", () => {
  it("reaches both the 311 and the police spelling from the basemap name", () => {
    const v = streetVariants("West 44th Street");
    expect(v[0]).toBe("WEST 44TH STREET");
    expect(v).toContain("WEST 44 STREET");
    expect(v).toContain("W 44 ST");
  });

  it("handles avenues, ordinal words and the app's short form", () => {
    expect(streetVariants("8th Avenue")).toEqual(expect.arrayContaining(["8 AVENUE", "8 AVE", "EIGHTH AVENUE"]));
    expect(streetVariants("W 44 St")).toContain("WEST 44 STREET");
    expect(streetVariants("Queens Blvd")).toContain("QUEENS BOULEVARD");
  });

  it("keeps a leading Saint and a one-word name as they are", () => {
    const v = streetVariants("St. Marks Place");
    expect(v).toContain("ST MARKS PL");
    expect(v).not.toContain("STREET MARKS PLACE");
    expect(streetVariants("Broadway")).toEqual(["BROADWAY"]);
  });
});

const row = (p: Partial<StreetRow>): StreetRow => ({
  street: "X",
  borough: "MANHATTAN",
  noise_12mo: "0",
  noise_90d: "0",
  crashes_12mo: "0",
  injury_crashes_12mo: "0",
  fatal_crashes_12mo: "0",
  noise_level: "yellow",
  crash_level: "yellow",
  ...p,
});

describe("mergeStreetRows", () => {
  it("adds counts per borough and takes each level from the spelling that holds that metric", () => {
    const merged = mergeStreetRows([
      row({ street: "W 44 ST", crashes_12mo: "18", injury_crashes_12mo: "7", crash_level: "red" }),
      row({ street: "WEST 44 STREET", noise_12mo: "99", noise_90d: "30", noise_level: "red" }),
      row({ street: "W 44 ST", borough: null, crashes_12mo: "3" }),
    ]);
    expect(merged).toEqual([
      {
        borough: "MANHATTAN",
        noise_12mo: 99,
        noise_90d: 30,
        crashes_12mo: 18,
        injury_crashes_12mo: 7,
        fatal_crashes_12mo: 0,
        noise_level: "red",
        crash_level: "red",
      },
    ]);
  });

  it("lists the borough with the most records first", () => {
    const merged = mergeStreetRows([
      row({ borough: "QUEENS", noise_12mo: "12" }),
      row({ borough: "BROOKLYN", noise_12mo: "927" }),
    ]);
    expect(merged.map((r) => r.borough)).toEqual(["BROOKLYN", "QUEENS"]);
  });
});
