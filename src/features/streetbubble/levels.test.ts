import { describe, expect, it } from "vitest";
import { levelStyle, pickRow, streetFromLabel, StreetResponse } from "./levels";

describe("levelStyle", () => {
  it("maps each level to a distinct colour", () => {
    const dots = (["green", "yellow", "orange", "red"] as const).map((l) => levelStyle(l).dot);
    expect(dots).toEqual(["bg-green-500", "bg-yellow-400", "bg-orange-500", "bg-red-500"]);
    expect(new Set(dots).size).toBe(4);
  });
  it("labels the ends of the scale", () => {
    expect(levelStyle("green").label).toBe("Low");
    expect(levelStyle("red").label).toBe("Very high");
  });
  it("falls back to neutral for unknown, null or undefined", () => {
    for (const v of ["purple", null, undefined, ""]) {
      expect(levelStyle(v).label).toBe("No data");
      expect(levelStyle(v).dot).not.toMatch(/green|red/);
    }
  });
});

describe("streetFromLabel", () => {
  it("takes the street before the cross street", () => {
    expect(streetFromLabel("Grand Street & Essex Street")).toBe("Grand Street");
    expect(streetFromLabel("Broadway")).toBe("Broadway");
  });
  it("returns null for empty input", () => {
    expect(streetFromLabel(null)).toBeNull();
    expect(streetFromLabel("")).toBeNull();
  });
});

describe("StreetResponse / pickRow", () => {
  const body = {
    name: "W 44 ST",
    rows: [
      { street: "W 44 ST", borough: null, noise_12mo: "0", noise_90d: "0", crashes_12mo: "3", injury_crashes_12mo: "1", fatal_crashes_12mo: "0", noise_level: "green", crash_level: "yellow" },
      { street: "W 44 ST", borough: "MANHATTAN", noise_12mo: "99", noise_90d: "31", crashes_12mo: "18", injury_crashes_12mo: "7", fatal_crashes_12mo: "0", noise_level: "red", crash_level: "red" },
    ],
  };
  it("coerces the string counts the API sends", () => {
    const parsed = StreetResponse.parse(body);
    expect(parsed.rows[1].noise_12mo).toBe(99);
  });
  it("prefers a row that has a borough", () => {
    expect(pickRow(StreetResponse.parse(body).rows)?.borough).toBe("MANHATTAN");
  });
  it("returns null for no rows", () => {
    expect(pickRow([])).toBeNull();
  });
});
