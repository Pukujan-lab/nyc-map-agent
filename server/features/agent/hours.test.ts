import { describe, expect, it } from "vitest";
import { hoursToday, openAt } from "./hours";

// Sunday 2026-10-25 in New York (EDT, UTC-4).
const at = (hhmm: string) => new Date(`2026-10-25T${hhmm}:00-04:00`);

describe("openAt", () => {
  it("a park restroom listed 8am-4pm is closed at 1:36 am and open at noon", () => {
    expect(openAt("8am-4pm, Open later seasonally", at("01:36"))).toBe(false);
    expect(openAt("8am-4pm, Open later seasonally", at("12:00"))).toBe(true);
    expect(openAt("8am-4pm", at("16:00"))).toBe(false);
  });
  it("reads ranges that run past midnight", () => {
    expect(openAt("6:00am-1:00am", at("00:30"))).toBe(true);
    expect(openAt("6am - 1am", at("03:00"))).toBe(false);
  });
  it("reads per-day lines, including closed days", () => {
    const library = "Sunday: Closed \nMonday: 10:00 am - 6:00 pm \nSaturday: 10:00 am - 5:00 pm";
    expect(openAt(library, at("12:00"))).toBe(false);
    const tabbed = "Monday\t10 am - 6 pm\nSunday\t1 pm - 5 pm";
    expect(openAt(tabbed, at("14:00"))).toBe(true);
    expect(openAt(tabbed, at("18:00"))).toBe(false);
  });
  it("handles 24 hours, temporary closures, a.m./p.m. and unknowns", () => {
    expect(openAt("24 Hours", at("03:00"))).toBe(true);
    expect(openAt("Temp Closed", at("12:00"))).toBe(false);
    expect(openAt("Bathrooms are open from 7 a.m.-7 p.m., with a one-hour closure", at("08:00"))).toBe(true);
    expect(openAt("Open by permit", at("12:00"))).toBeNull();
    expect(openAt(null, at("12:00"))).toBeNull();
  });
});

describe("hoursToday", () => {
  const week = "Sunday: Closed \nMonday: 8:00 am - 9:00 pm \nTuesday: 8:00 am - 9:00 pm";
  it("picks today's line from a week of hours", () => {
    expect(hoursToday(week, at("12:00"))).toBe("closed");
    expect(hoursToday(week, new Date("2026-10-26T12:00:00-04:00"))).toBe("8:00 am - 9:00 pm");
  });

  it("keeps one short line without days, and drops a long or unknown one", () => {
    expect(hoursToday("8am-8pm", at("12:00"))).toBe("8am-8pm");
    expect(hoursToday("Wednesday: 9am-5pm", at("12:00"))).toBeNull();
    expect(hoursToday(null, at("12:00"))).toBeNull();
  });
});
