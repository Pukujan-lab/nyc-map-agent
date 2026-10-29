import { describe, expect, it } from "vitest";
import { estimateTrain, type LiveTrip, type StaticSystem } from "./model";
import { CATCH_UP_MPS, ProgressTracker, SNAP_AHEAD_M } from "./monotonic";

const sys: StaticSystem = {
  system: "subway",
  routes: { G: { name: "Crosstown", short: "G", color: "#6CBE45", text: "#FFFFFF" } },
  lines: { type: "FeatureCollection", features: [] },
  stations: { type: "FeatureCollection", features: [] },
  shapes: { G: { c: [[-73.95, 40.7], [-73.95, 40.72]], m: [0, 2226], g: ["underground", "underground"] } },
  stopM: { G: { A: 0, B: 1113, C: 2226 } },
};
const trip = (stops: LiveTrip["stops"]): LiveTrip => ({ id: "t1", route: "G", dir: 0, stops });

describe("monotonic train progress", () => {
  it("reproduces the backward jump without the tracker when the next ETA slips", () => {
    const before = estimateTrain(sys, trip([["BN", 200], ["CN", 300]]), 170)!;
    const after = estimateTrain(sys, trip([["BN", 260], ["CN", 360]]), 171)!;
    expect(after.lat).toBeLessThan(before.lat); // the bug: drawn train moves backward
  });

  it("never moves backward when the next ETA slips; slows down and arrives at the new ETA", () => {
    const tr = new ProgressTracker();
    const lats: number[] = [];
    lats.push(estimateTrain(sys, trip([["BN", 200], ["CN", 300]]), 170, tr)!.lat);
    for (let t = 171; t <= 260; t++) lats.push(estimateTrain(sys, trip([["BN", 260], ["CN", 360]]), t, tr)!.lat);
    for (let i = 1; i < lats.length; i++) expect(lats[i]).toBeGreaterThanOrEqual(lats[i - 1] - 1e-12);
    expect(lats[lats.length - 1]).toBeCloseTo(40.71, 4); // at B on the new ETA
  });

  it("sits out the dwell, then leaves without passing the next listed stop", () => {
    const tr = new ProgressTracker();
    const sitting = estimateTrain(sys, trip([["BN", 200], ["CN", 300]]), 210, tr)!;
    expect(sitting.lat).toBeCloseTo(40.71, 4);
    expect(sitting.stopped?.kind).toBe("at");
    const late = estimateTrain(sys, trip([["BN", 200], ["CN", 300]]), 280, tr)!; // dwell over, B still listed
    expect(late.lat).toBeGreaterThan(40.71);
    expect(late.lat).toBeLessThan(40.72);
    expect(late.stopped).toBeUndefined();
    const gone = estimateTrain(sys, trip([["CN", 300]]), 285, tr)!;
    expect(gone.lat).toBeGreaterThanOrEqual(late.lat - 1e-9);
  });

  it("ignores a fresh snapshot that puts the train behind, but resets on a reroute", () => {
    const tr = new ProgressTracker();
    const a = tr.update({ key: "k", route: "G", forward: 1, m: 900, holdM: 1113, holdEta: 200 }, 100);
    const b = tr.update({ key: "k", route: "G", forward: 1, m: 850, holdM: 1113, holdEta: 200 }, 101);
    expect(b).toBeGreaterThanOrEqual(a);
    const r = tr.update({ key: "k", route: "F", forward: 1, m: 100, holdM: 500, holdEta: 200 }, 102);
    expect(r).toBe(100);
  });

  it("works for trips running toward decreasing shape metres", () => {
    const tr = new ProgressTracker();
    const a = tr.update({ key: "s", route: "G", forward: -1, m: 1500, holdM: 1113, holdEta: 200 }, 100);
    const b = tr.update({ key: "s", route: "G", forward: -1, m: 1600, holdM: 1113, holdEta: 200 }, 101);
    expect(b).toBeLessThanOrEqual(a);
  });

  it("catches up at a train's speed when released after a hold, instead of jumping ahead", () => {
    const tr = new ProgressTracker();
    const base = { key: "subway:t9", route: "E", forward: 1 };
    // Held at the stop at 1000 m while the feed still lists it.
    expect(tr.update({ ...base, m: 1000, holdM: 1000, holdEta: 100 }, 100)).toBe(1000);
    // The feed clears the stop: the raw estimate is now 600 m further on.
    const one = tr.update({ ...base, m: 1600, holdM: 2000, holdEta: 200 }, 101);
    expect(one).toBe(1000 + CATCH_UP_MPS);
    let p = one;
    for (let t = 102; t <= 140; t++) {
      const next = tr.update({ ...base, m: 1600, holdM: 2000, holdEta: 200 }, t);
      expect(next - p).toBeLessThanOrEqual(CATCH_UP_MPS + 1e-9);
      p = next;
    }
    expect(p).toBe(1600); // caught up, then holds the estimate
  });

  it("draws a far jump ahead at once: a new snapshot, not a moving train", () => {
    const tr = new ProgressTracker();
    const base = { key: "subway:t10", route: "E", forward: 1 };
    tr.update({ ...base, m: 0 }, 100);
    expect(tr.update({ ...base, m: SNAP_AHEAD_M + 100 }, 101)).toBe(SNAP_AHEAD_M + 100);
  });
});
