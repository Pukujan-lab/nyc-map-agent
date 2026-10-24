import { describe, expect, it } from "vitest";
import { etaText, nearestStop } from "./busStop";

describe("nearestStop", () => {
  const stops = [{ id: "a", lat: 40.7, lon: -73.8 }, { id: "b", lat: 40.7003, lon: -73.8 }];
  it("picks the closest stop", () => expect(nearestStop(stops, -73.8, 40.70028)?.id).toBe("b"));
  it("returns nothing when all are too far", () => expect(nearestStop(stops, -73.8, 40.71)).toBeUndefined());
});

describe("etaText", () => {
  it("words minutes", () => {
    expect(etaText(1000 + 20, 1000)).toBe("Due");
    expect(etaText(1000 + 240, 1000)).toBe("4 min");
    expect(etaText(1000 + 3900, 1000)).toBe("1 h 5 min");
    expect(etaText(null, 1000)).toBe("");
  });
});
