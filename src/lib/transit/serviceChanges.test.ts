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
  // Live MTA wording the parser used to miss (audit of the feed, 2026-10-27).
  it("reads skips with local/express and two bullets", () => {
    const a = serviceChanges({ id: "e", routes: ["A"], text: "In Manhattan, uptown [A] local skips 72 St, 81 St and 116 St" });
    expect(a[0]).toMatchObject({ route: "A", toward: "Uptown", names: ["72 St", "81 St", "116 St"] });
    const b = serviceChanges({ id: "f", routes: ["1", "2"], text: "In Manhattan, downtown [1] and [2] local skip Christopher St-Stonewall, Houston St, Canal St and Franklin St" });
    expect(b.map((c) => c.route)).toEqual(["1", "2"]);
    expect(b[0]).toMatchObject({ toward: "Downtown", names: ["Christopher St-Stonewall", "Houston St", "Canal St", "Franklin St"] });
  });
  it("leaves a trailing clause out of the skipped stations", () => {
    const [c] = serviceChanges({ id: "g", routes: ["4"], text: "In the Bronx, Woodlawn-bound [4] skips 170 St, Mt Eden Av and 176 St and runs every 16 minutes (days/evenings)" });
    expect(c.names).toEqual(["170 St", "Mt Eden Av", "176 St"]);
  });
  it("reads a station closed outright, with and without a direction", () => {
    const [a] = serviceChanges({ id: "h", routes: ["7"], text: "In Queens, no [7] at Flushing-Main St" });
    expect(a).toMatchObject({ kind: "skip", route: "7", toward: null, names: ["Flushing-Main St"] });
    const [b] = serviceChanges({ id: "i", routes: ["F"], text: "No Jamaica-bound [F] service at 57 St, Lexington Av/63 St, Roosevelt Island, and 21 St-Queensbridge" });
    expect(b).toMatchObject({ kind: "skip", toward: "Jamaica", names: ["57 St", "Lexington Av", "Roosevelt Island", "21 St-Queensbridge"] });
  });
  it("reads a suspension between two stations, boroughs dropped", () => {
    const [w] = serviceChanges({ id: "j", routes: ["W"], text: "No [W] between 57 St-7 Av, Manhattan and Astoria-Ditmars Blvd, Queens - take the [N] instead" });
    expect(w).toMatchObject({ kind: "suspended", route: "W", names: ["57 St-7 Av", "Astoria-Ditmars Blvd"] });
    const four = serviceChanges({ id: "k", routes: ["4", "6"], text: "No [4] between Grand Central-42 St, Manhattan and Utica Av/New Lots Av, Brooklyn\nNo [6] between Grand Central-42 St and Brooklyn Bridge-City Hall" });
    expect(four.map((c) => [c.route, c.names])).toEqual([["4", ["Grand Central-42 St", "Utica Av"]], ["6", ["Grand Central-42 St", "Brooklyn Bridge-City Hall"]]]);
  });
  it("reads platform changes worded the other way round", () => {
    const four = serviceChanges({ id: "l", routes: ["4"], text: "In the Bronx, Woodlawn-bound [4] skips 170 St, Mt Eden Av and 176 St\nAll trains board from the Manhattan-bound platform at Burnside Av" });
    expect(four[1]).toMatchObject({ kind: "platform", names: ["Burnside Av"], toward: "Woodlawn", platform: "Manhattan" });
    const [si] = serviceChanges({ id: "m", routes: ["SI"], text: "All [SIR] trains from Eltingville to Huguenot board from the St George-bound platform" });
    expect(si).toMatchObject({ kind: "platform", names: ["Eltingville", "Huguenot"], platform: "St George", toward: null });
  });
  it("keeps a numbered direction label whole", () => {
    const [c] = serviceChanges({ id: "n", routes: ["L"], text: "In Manhattan, all [L] trains at 3 Av and 1 Av board from the 8 Av-bound platform" });
    expect(c).toMatchObject({ toward: null, platform: "8 Av", notice: "All L trains board from the 8 Av-bound platform" });
  });
  it("maps direction labels to line ends both ways", () => {
    expect(towardEnd("Flushing", SEVEN_ENDS)).toBe(1);
    expect(towardEnd("Manhattan", SEVEN_ENDS)).toBe(0);
    expect(otherDirection("Flushing", SEVEN_ENDS)).toBe("Manhattan");
    expect(otherDirection("Manhattan", SEVEN_ENDS)).toBe("Flushing");
  });
});
