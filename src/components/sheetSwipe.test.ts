import { describe, expect, it } from "vitest";
import { nextLevel, nextTab, swipeOf } from "./sheetSwipe";

describe("sheet swipes", () => {
  it("reads a clear swipe and ignores taps and diagonals", () => {
    expect(swipeOf(0, -80)).toBe("up");
    expect(swipeOf(5, 60)).toBe("down");
    expect(swipeOf(-70, 10)).toBe("left");
    expect(swipeOf(70, -10)).toBe("right");
    expect(swipeOf(4, 6)).toBeNull();
    expect(swipeOf(60, 55)).toBeNull();
  });

  it("opens and closes one step at a time", () => {
    expect(nextLevel(0, "up")).toBe(1);
    expect(nextLevel(1, "up")).toBe(2);
    expect(nextLevel(2, "up")).toBe(2);
    expect(nextLevel(2, "down")).toBe(1);
    expect(nextLevel(0, "down")).toBe(0);
  });

  it("moves between categories either way, wrapping round", () => {
    const tabs = ["train", "notices", "settings"] as const;
    expect(nextTab(tabs, "train", "left")).toBe("notices");
    expect(nextTab(tabs, "settings", "left")).toBe("train");
    expect(nextTab(tabs, "train", "right")).toBe("settings");
  });
});
