import { describe, expect, it } from "vitest";
import { searchForFilters } from "./mapFilters";

describe("filter search params", () => {
  it("leaves the address alone when the patch has no URL filters", () => {
    const prev = new URLSearchParams("transit=subway,lirr");
    expect(searchForFilters(prev, { roads: false })).toBe(prev);
  });
  it("hides restrooms, turns eco on, and drops live trains", () => {
    const next = searchForFilters(new URLSearchParams(), { restrooms: false, eco: true, liveTrains: false });
    expect(next.get("restrooms")).toBe("0");
    expect(next.get("eco")).toBe("1");
    expect(next.get("transit")).toBe("none");
  });
  it("hides live buses without turning the whole fleet on", () => {
    const next = searchForFilters(new URLSearchParams("transit=subway,bus&busPage=queens-1"), { liveBuses: false });
    expect(next.get("busPage")).toBeNull();
    expect(next.get("transit")).toBeNull();
  });
  it("adds a feature chip and can take it off again", () => {
    const on = searchForFilters(new URLSearchParams(), { parking: true, events: true });
    expect(on.get("on")).toBe("events,parking");
    const off = searchForFilters(on, { events: false });
    expect(off.get("on")).toBe("parking");
  });
});
