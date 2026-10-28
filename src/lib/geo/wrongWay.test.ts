import { describe, expect, it } from "vitest";
import { awayStep, initialAway, turnAroundLine, WRONG_WAY_M, type AwayState } from "./wrongWay";

const feed = (ds: number[], key = "a", accuracy: number | null = 8, s: AwayState = initialAway) =>
  ds.reduce((st, d) => awayStep(st, key, d, accuracy), s);

describe("walking the wrong way", () => {
  it("warns once the distance grows past the closest by more than 20 m", () => {
    expect(feed([100, 90, 80, 95]).away).toBe(false);
    expect(feed([100, 90, 80, 80 + WRONG_WAY_M + 1]).away).toBe(true);
  });

  it("ignores vague fixes, so GPS jitter underground never warns", () => {
    expect(feed([100, 90, 80, 140], "a", 120).away).toBe(false);
    expect(feed([100, 90, 80, 140], "a", 8).away).toBe(true);
  });

  it("clears when you walk back toward it, and starts over at a new turn", () => {
    const wrong = feed([100, 80, 110]);
    expect(wrong.away).toBe(true);
    expect(feed([84], "a", 8, wrong).away).toBe(false);
    expect(awayStep(wrong, "b", 200, 8)).toEqual({ key: "b", best: 200, away: false });
  });

  it("names the street that is behind you", () => {
    expect(turnAroundLine("Madison Ave")).toBe("Turn around, Madison Ave is behind you");
    expect(turnAroundLine("")).toMatch(/^Turn around/);
  });
});
