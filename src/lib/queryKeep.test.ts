import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { KEEP_MAX_AGE_MS, isKept, restore, snapshot } from "./queryKeep";

describe("queryKeep", () => {
  it("keeps slow-changing data and never live positions", () => {
    expect(isKept(["transit", "static", "subway"])).toBe(true);
    expect(isKept(["district-boundaries"])).toBe(true);
    expect(isKept(["transit", "live-batch", "subway"])).toBe(false);
    expect(isKept(["hazards", "x"])).toBe(false);
  });

  it("saves loaded kept queries and puts them back with their age, marked stale", () => {
    const a = new QueryClient();
    a.setQueryData(["transit", "static", "subway"], { lines: 1 }, { updatedAt: 1_000 });
    a.setQueryData(["transit", "live-batch", "k"], { trains: 9 });
    const rows = snapshot(a);
    expect(rows).toEqual([{ key: ["transit", "static", "subway"], data: { lines: 1 }, at: 1_000 }]);

    const b = new QueryClient();
    expect(restore(b, rows, 2_000)).toBe(1);
    expect(b.getQueryData(["transit", "static", "subway"])).toEqual({ lines: 1 });
    expect(b.getQueryState(["transit", "static", "subway"])?.dataUpdatedAt).toBe(1_000);
    expect(b.getQueryState(["transit", "static", "subway"])?.isInvalidated).toBe(true);
  });

  it("never overwrites data that already arrived, and drops data that is too old", () => {
    const b = new QueryClient();
    b.setQueryData(["transit", "meta"], { bus: true }, { updatedAt: 5_000 });
    const rows = [{ key: ["transit", "meta"], data: { bus: false }, at: 1_000 }, { key: ["transit", "xray"], data: {}, at: 0 }];
    expect(restore(b, rows, KEEP_MAX_AGE_MS + 1)).toBe(0);
    expect(b.getQueryData(["transit", "meta"])).toEqual({ bus: true });
    expect(b.getQueryData(["transit", "xray"])).toBeUndefined();
  });
});
