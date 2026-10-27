import { describe, expect, it } from "vitest";
import { lineChoice } from "./lineChoice";

describe("lineChoice", () => {
  it("offers each line and the station where several meet", () => {
    expect(lineChoice(["J"], { id: "M11", name: "Myrtle Av", routes: "J M Z" })).toEqual({ routes: ["J", "M", "Z"], station: { id: "M11", name: "Myrtle Av" } });
  });

  it("offers the lines on a shared track away from a station", () => {
    expect(lineChoice(["J", "M", "J"])).toEqual({ routes: ["J", "M"] });
  });

  it("counts an express run as its line", () => {
    expect(lineChoice(["6", "6X"])).toBe("6");
  });

  it("opens one line straight away", () => {
    expect(lineChoice(["G"])).toBe("G");
    expect(lineChoice([], { id: "G32", name: "Myrtle-Willoughby Avs", routes: "G" })).toBe("G");
  });

  it("adds a line passing the station that does not stop there", () => {
    expect(lineChoice(["L"], { id: "M08", name: "Myrtle-Wyckoff Avs", routes: "M" })).toEqual({ routes: ["M", "L"], station: { id: "M08", name: "Myrtle-Wyckoff Avs" } });
  });

  it("offers nothing off the subway", () => {
    expect(lineChoice([])).toBeNull();
  });
});
