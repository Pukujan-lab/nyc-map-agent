import { describe, expect, it } from "vitest";
import { BusObserver, runMedians, type BusPos } from "./busObserve";

const M = 1 / 111_320;
const pos = (t: number, m: number, next: string): BusPos => ({ id: "v1", route: "M15", dir: 0, lon: -73.98, lat: 40.7 + m * M, next, t });

describe("BusObserver", () => {
  it("derives travel between consecutive departures and dwell from stationary reports", () => {
    const o = new BusObserver();
    const out = [
      ...o.ingest([pos(0, 0, "A")]),
      ...o.ingest([pos(30, 150, "B")]),   // left A at 15
      ...o.ingest([pos(60, 300, "B")]),
      ...o.ingest([pos(90, 302, "B")]),   // stationary at B from 60
      ...o.ingest([pos(120, 303, "B")]),
      ...o.ingest([pos(150, 450, "C")]),  // left B at 135
    ];
    expect(out).toEqual([
      expect.objectContaining({ kind: "dwell", from: "B", to: "B", seconds: 75 }),
      expect.objectContaining({ kind: "travel", from: "A", to: "B", seconds: 120 }),
    ]);
  });
  it("drops gaps, route changes and duplicates", () => {
    const o = new BusObserver();
    o.ingest([pos(0, 0, "A")]);
    o.ingest([pos(30, 150, "B")]);
    expect(o.ingest([pos(400, 900, "C")])).toEqual([]); // gap > 2 min resets
    expect(o.ingest([pos(400, 900, "D")])).toEqual([]); // duplicate timestamp
    expect(o.ingest([{ ...pos(430, 1000, "E"), route: "M101" }])).toEqual([]);
  });
});

describe("runMedians", () => {
  it("groups by segment and hour of week", () => {
    const rows = runMedians(
      [10, 20, 90].map((s) => ({ at: 0, route: "M15", dir: 0, from: "A", to: "B", kind: "travel" as const, seconds: s })),
      () => ({ dow: 4, hour: 2 }),
    );
    expect(rows).toEqual([{ route: "M15", dir: 0, from: "A", to: "B", kind: "travel", dow: 4, hour: 2, n: 3, median: 20 }]);
  });
});
