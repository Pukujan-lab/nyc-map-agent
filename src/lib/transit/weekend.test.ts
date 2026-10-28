import { describe, expect, it } from "vitest";
import { nyEpoch, weekendWindow } from "./weekend";

const at = (iso: string) => Date.parse(iso);
const ny = (s: number) => new Date(s * 1000).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", hour12: false });

describe("weekend window", () => {
  it("on a Tuesday is the coming Friday 9 pm to Monday 5 am, New York time", () => {
    const w = weekendWindow(at("2026-10-27T20:00:00-04:00"));
    expect(ny(w.from)).toBe("Fri, Oct 30, 21");
    expect(ny(w.to)).toBe("Mon, Nov 2, 05"); // across the clocks going back
  });
  it("on a Sunday is the weekend under way", () => {
    const w = weekendWindow(at("2026-11-15T12:00:00-05:00"));
    expect(ny(w.from)).toBe("Fri, Nov 13, 21");
  });
  it("early Monday is still the weekend's work", () => {
    expect(ny(weekendWindow(at("2026-11-16T03:00:00-05:00")).from)).toBe("Fri, Nov 13, 21");
  });
  it("reads New York wall clock in summer and winter", () => {
    expect(nyEpoch(2026, 7, 4, 12)).toBe(Date.parse("2026-07-04T12:00:00-04:00") / 1000);
    expect(nyEpoch(2026, 12, 4, 12)).toBe(Date.parse("2026-12-04T12:00:00-05:00") / 1000);
  });
});
