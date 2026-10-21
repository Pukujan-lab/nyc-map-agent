import { describe, expect, it } from "vitest";
import { SegmentObserver } from "./observe";

describe("SegmentObserver", () => {
  it("records dwell and travel when stops drop out of the feed", () => {
    const o = new SegmentObserver("subway");
    expect(o.ingest([{ id: "t", route: "G", dir: 0, stops: [["A", 100, 130], ["B", 220, 250], ["C", 400]] }], 90)).toEqual([]);
    expect(o.ingest([{ id: "t", route: "G", dir: 0, stops: [["B", 225, 255], ["C", 405]] }], 140)).toEqual([
      expect.objectContaining({ kind: "dwell", from: "A", to: "A", seconds: 30 }),
    ]);
    const out = o.ingest([{ id: "t", route: "G", dir: 0, stops: [["C", 410]] }], 260);
    expect(out).toEqual([
      expect.objectContaining({ kind: "dwell", from: "B", seconds: 30 }),
      expect.objectContaining({ kind: "travel", from: "A", to: "B", seconds: 95 }),
    ]);
  });
  it("ignores stops dropped before they were due (skip or reroute)", () => {
    const o = new SegmentObserver("subway");
    o.ingest([{ id: "t", route: "G", dir: 0, stops: [["A", 1000], ["B", 1100]] }], 100);
    expect(o.ingest([{ id: "t", route: "G", dir: 0, stops: [["B", 1100]] }], 110)).toEqual([]);
  });
});
