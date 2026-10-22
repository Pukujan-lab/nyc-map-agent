import { describe, expect, it } from "vitest";
import { blendStops, liveWeight, lookupFrom } from "./history";

const stops = [{ id: "A", arr: 100 }, { id: "B", arr: 200 }, { id: "C", arr: 1300 }];

describe("historical segment blend", () => {
  it("falls back to live/schedule times when there is no history", () => {
    expect(blendStops(stops, 0, "G", 0)).toBe(stops);
    expect(blendStops(stops, 0, "G", 0, () => undefined).map((s) => s.arr)).toEqual([100, 200, 1300]);
  });
  it("keeps the next stop's live ETA and pulls far legs toward the median", () => {
    const hist = lookupFrom(new Map([["G", [{ dir: 0, from: "B", to: "C", kind: "travel" as const, n: 20, median: 150, p80: 180 }]]]));
    const out = blendStops(stops, 100, "G", 0, hist);
    expect(out[0].arr).toBe(100);
    expect(out[1].arr).toBe(200);
    const w = liveWeight(100);
    expect(out[2].arr).toBeCloseTo(200 + w * 1100 + (1 - w) * 150, 6);
    expect(out[2].arr).toBeLessThan(1300);
  });
  it("trusts live more for near legs", () => {
    expect(liveWeight(0)).toBeGreaterThan(liveWeight(1200));
  });
});
