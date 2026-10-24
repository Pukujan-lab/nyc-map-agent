import { describe, expect, it } from "vitest";
import { activeAt } from "./services";
import { nyLocalToDate } from "./trip";
import { isFuture, parseWhen, scheduleFor } from "./when";

// Saturday 24 Oct 2026, 14:30 in New York (EDT, UTC-4).
const NOW = nyLocalToDate("2026-10-24T14:30");

describe("parseWhen: the user's words in New York time", () => {
  it.each([
    ["tomorrow at 9am", "2026-10-25T09:00"],
    ["tomorrow 9 a.m.", "2026-10-25T09:00"],
    ["Tomorrow morning", "2026-10-25T09:00"],
    ["tonight at 8:15", "2026-10-24T20:15"],
    ["today at 6pm", "2026-10-24T18:00"],
    ["at noon tomorrow", "2026-10-25T12:00"],
    ["day after tomorrow 7:45am", "2026-10-26T07:45"],
    ["monday 8am", "2026-10-26T08:00"],
    ["next saturday 10am", "2026-10-31T10:00"],
    ["2026-11-02 9am", "2026-11-02T09:00"],
    ["2026-10-30T17:20", "2026-10-30T17:20"],
    ["in 45 minutes", "2026-10-24T15:15"],
    ["in 2 hours", "2026-10-24T16:30"],
  ])("%s → %s", (words, local) => {
    expect(parseWhen(words, NOW)).toBe(local);
  });

  it("now and a blank mean now", () => {
    expect(parseWhen("now", NOW)).toBe("2026-10-24T14:30");
    expect(parseWhen("", NOW)).toBe("2026-10-24T14:30");
  });

  it("a time already past today means tomorrow", () => {
    expect(parseWhen("9am", NOW)).toBe("2026-10-25T09:00");
    expect(parseWhen("5:30 pm", NOW)).toBe("2026-10-24T17:30");
  });

  it("today's weekday is today while the time is ahead, else next week", () => {
    expect(parseWhen("saturday 6pm", NOW)).toBe("2026-10-24T18:00");
    expect(parseWhen("saturday 9am", NOW)).toBe("2026-10-31T09:00");
  });

  it("is DST-correct across the November change", () => {
    // 1 Nov 2026 ends EDT: 9am on 2 Nov is 14:00 UTC, not 13:00.
    expect(nyLocalToDate(parseWhen("2026-11-02 9am", NOW)!).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("returns null for words with no time in them", () => {
    expect(parseWhen("whenever", NOW)).toBeNull();
    expect(parseWhen("3 stops", NOW)).toBeNull();
    expect(parseWhen("25pm", NOW)).toBeNull();
  });
});

describe("what is known for a trip planned ahead", () => {
  it("within the hour counts as live; later does not", () => {
    expect(isFuture("2026-10-24T15:00", NOW)).toBe(false);
    expect(isFuture("2026-10-25T09:00", NOW)).toBe(true);
    expect(scheduleFor("2026-10-24T15:00", NOW)).toBeUndefined();
  });

  it("says the time and that live delays are not known", () => {
    const s = scheduleFor("2026-10-25T09:00", NOW)!;
    expect(s.future).toBe(true);
    expect(s.note).toContain("Sun, Oct 25, 9:00 AM");
    expect(s.note).toMatch(/live delays are not known/);
  });
});

describe("activeAt: planned work covers the trip's time", () => {
  const nine = Math.floor(nyLocalToDate("2026-10-25T09:00").getTime() / 1000);
  const hour = 3600;
  it("an alert with no period is always in force", () => {
    expect(activeAt([], nine)).toBe(true);
  });
  it("only a period around the time counts", () => {
    expect(activeAt([{ start: nine - hour, end: nine + hour }], nine)).toBe(true);
    // Weekend work that ends before 9am, or overnight work starting after it.
    expect(activeAt([{ start: nine - 10 * hour, end: nine - hour }], nine)).toBe(false);
    expect(activeAt([{ start: nine + 12 * hour, end: nine + 20 * hour }], nine)).toBe(false);
    expect(activeAt([{ start: nine - 10 * hour, end: nine - hour }, { start: nine - 60, end: nine + 60 }], nine)).toBe(true);
  });
  it("a missing or zero start or end is open-ended", () => {
    expect(activeAt([{ start: nine - hour }], nine)).toBe(true);
    expect(activeAt([{ end: nine + hour }], nine)).toBe(true);
    expect(activeAt([{ start: nine - hour, end: 0 }], nine)).toBe(true);
    expect(activeAt([{ start: nine + hour }], nine)).toBe(false);
  });
});
