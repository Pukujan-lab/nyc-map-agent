import { describe, expect, it } from "vitest";
import { otherDirection, serviceChanges, towardEnd } from "./serviceChanges";

const SEVEN_ENDS = [{ name: "34 St-Hudson Yards", at: [-74.002, 40.7555] as const }, { name: "Flushing-Main St", at: [-73.83, 40.7596] as const }];

describe("station service changes", () => {
  it("reads a Flushing-bound skip plus a platform change from the 7 alert", () => {
    const c = serviceChanges({ id: "a", routes: ["7"], text: "In Queens, Flushing-bound [7] skips 52 St and 69 St\nAll trains at Woodside-61 St board from the Manhattan-bound platform" });
    expect(c[0]).toMatchObject({ kind: "skip", route: "7", names: ["52 St", "69 St"], toward: "Flushing", notice: "Skipped Flushing-bound" });
    expect(c[1]).toMatchObject({ kind: "platform", names: ["Woodside-61 St"], toward: "Flushing", platform: "Manhattan", notice: "Flushing-bound trains board from the Manhattan-bound platform" });
  });
  it("reads a Manhattan-bound skip (the other direction)", () => {
    const [c] = serviceChanges({ id: "b", routes: ["7"], text: "In Queens, Manhattan-bound [7] skips 111 St, 103 St, 90 St and 82 St" });
    expect(c).toMatchObject({ toward: "Manhattan", names: ["111 St", "103 St", "90 St", "82 St"] });
  });
  it("treats a skip with no direction as both directions", () => {
    const [c] = serviceChanges({ id: "c", routes: ["F"], text: "[F] skips York St" });
    expect(c).toMatchObject({ toward: null, notice: "Skipped in both directions" });
  });
  it("reads an all-trains platform change at two stations", () => {
    const [c] = serviceChanges({ id: "d", routes: ["7"], text: "In Queens, all [7] trains at Vernon Blvd-Jackson Av and Hunters Point Av board from the Manhattan-bound platform" });
    expect(c).toMatchObject({ kind: "platform", toward: null, names: ["Vernon Blvd-Jackson Av", "Hunters Point Av"], notice: "All 7 trains board from the Manhattan-bound platform" });
  });
  it("maps direction labels to line ends both ways", () => {
    expect(towardEnd("Flushing", SEVEN_ENDS)).toBe(1);
    expect(towardEnd("Manhattan", SEVEN_ENDS)).toBe(0);
    expect(otherDirection("Flushing", SEVEN_ENDS)).toBe("Manhattan");
    expect(otherDirection("Manhattan", SEVEN_ENDS)).toBe("Flushing");
  });
});
