import { afterEach, describe, expect, it } from "vitest";
import { COMMUTE_KEY, HOME_WORK_KEY, setRemembering } from "@/lib/memory/memory";
import { clockLabel, memorySummary } from "./memorySummary";
import { requestBody } from "./schema";

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

const places = {
  home: { label: "59 St", lon: -73.989, lat: 40.768 },
  work: { label: "14 St", lon: -74.001, lat: 40.738 },
};
const usual = { route: "A", minutes: 32, board: "59 St", alight: "14 St", hour: 8, minute: 40, transfers: [] };

afterEach(() => {
  const s = fakeStorage();
  setRemembering("rides", true, s);
  setRemembering("homeWork", true, s);
  setRemembering("exactLocation", false, s);
});

describe("memory summary", () => {
  it("says the usual ride, including a stored clock, and never a coordinate", () => {
    const s = fakeStorage({
      [HOME_WORK_KEY]: JSON.stringify(places),
      [COMMUTE_KEY]: JSON.stringify({ work: usual }),
    });
    const line = memorySummary(s);
    expect(line).toBe("Usually takes the A from 59 St to 14 St around 8:40 AM on weekdays");
    expect(line).not.toContain("40.768");
    expect(line).not.toContain("-73.989");
    expect(clockLabel(20, 5)).toBe("8:05 PM");
  });

  it("does not invent a clock when none was stored", () => {
    const s = fakeStorage({ [COMMUTE_KEY]: JSON.stringify({ work: { route: "A", minutes: 32, board: "59 St", transfers: [] } }) });
    expect(memorySummary(s)).toBe("Usually takes the A from 59 St on weekdays");
    expect(memorySummary(s)).not.toMatch(/around/);
  });

  it("falls back to Home and Work names when there is no usual ride", () => {
    const s = fakeStorage({ [HOME_WORK_KEY]: JSON.stringify(places) });
    const line = memorySummary(s);
    expect(line).toBe("Home is 59 St and Work is 14 St");
    expect(line).not.toContain("40.768");
  });

  it("sends nothing when Daily rides and Home & Work are both off", () => {
    const s = fakeStorage({
      [HOME_WORK_KEY]: JSON.stringify(places),
      [COMMUTE_KEY]: JSON.stringify({ work: usual }),
    });
    setRemembering("rides", false, s);
    setRemembering("homeWork", false, s);
    expect(memorySummary(s)).toBeNull();
  });

  it("drops the ride when Daily rides is off, and keeps Home and Work", () => {
    const s = fakeStorage({
      [HOME_WORK_KEY]: JSON.stringify(places),
      [COMMUTE_KEY]: JSON.stringify({ work: usual }),
    });
    setRemembering("rides", false, s);
    expect(memorySummary(s)).toBe("Home is 59 St and Work is 14 St");
  });
});

describe("memory on the agent request", () => {
  const messages = [{ role: "user" as const, content: "how do I get to work" }];

  it("accepts one short line and refuses anything longer, and allows the field to be absent", () => {
    expect(requestBody.safeParse({ messages }).success).toBe(true);
    expect(requestBody.parse({ messages }).memory).toBeUndefined();
    expect(requestBody.parse({ messages, memory: "Usually takes the A" }).memory).toBe("Usually takes the A");
    expect(requestBody.safeParse({ messages, memory: "x".repeat(241) }).success).toBe(false);
  });
});
