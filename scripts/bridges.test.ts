import { describe, expect, it } from "vitest";
import { bridgeFeatures, deckWidth, majorHeight, profile } from "./bridges";

describe("bridges", () => {
  it("knows the big bridges and deck widths", () => {
    expect(majorHeight({ name: "Brooklyn Bridge" })).toBe(41);
    expect(majorHeight({ "bridge:name": "Verrazzano-Narrows Bridge", name: "I-278" })).toBe(69);
    expect(majorHeight({ name: "Atlantic Avenue" })).toBeUndefined();
    expect(deckWidth({ lanes: "2" })).toBeCloseTo(8.8);
    expect(deckWidth({ railway: "subway" })).toBe(5);
  });
  it("ramps from the shore to full clearance", () => {
    expect(profile(0, 1000, 40)).toBe(0);
    expect(profile(500, 1000, 40)).toBe(40);
    expect(profile(110, 1000, 40)).toBeCloseTo(20);
  });
  it("cuts a way into decks, rails and piers", () => {
    const f = bridgeFeatures([{ p: { name: "Brooklyn Bridge", highway: "primary" }, pts: [[-74.0, 40.705], [-73.99, 40.705]] }]) as Array<{ properties: { kind: string; height: number } }>;
    const kinds = new Set(f.map((x) => x.properties.kind));
    expect([...kinds].sort()).toEqual(["deck", "pier", "rail"]);
    expect(Math.max(...f.map((x) => x.properties.height))).toBeGreaterThan(40);
  });
});
