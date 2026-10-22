import { describe, expect, it } from "vitest";
import { BusEstimator, buildShape, deadReckon, legMotion, project, type LonLat, type RouteGeom } from "./busEstimate";

// A straight 2 km line heading north along a meridian, stops every 400 m.
const LAT0 = 40.7, LON0 = -73.99, M = 1 / 111_320;
const line: LonLat[] = Array.from({ length: 21 }, (_, i) => [LON0, LAT0 + i * 100 * M]);
const stops = [1, 2, 3, 4].map((k) => ({ id: `S${k}`, lon: LON0, lat: LAT0 + k * 400 * M }));
const geom: RouteGeom = { route: "M1", lines: [line], stops };
const at = (m: number) => ({ lon: LON0 + 0.00005, lat: LAT0 + m * M });
const sOf = (lat: number) => (lat - LAT0) / M;

function sim(est: BusEstimator, id: string, from: number, to: number, step = 1 / 15) {
  const out: number[] = [];
  for (let t = from; t <= to + 1e-9; t += step) { const f = est.frame(id, t); if (f) out.push(sOf(f.lat)); }
  return out;
}

describe("shape geometry", () => {
  it("snaps a GPS fix to distance along the shape", () => {
    const sh = buildShape(line, stops);
    const p = project(sh, at(730).lon, at(730).lat);
    expect(p.s).toBeCloseTo(730, 0);
    expect(p.d).toBeLessThan(6);
    expect(sh.stops.map((s) => Math.round(s.s))).toEqual([400, 800, 1200, 1600]);
  });
  it("leg motion brakes to a stop at the end of the leg", () => {
    const [, total] = legMotion(300, 6, 6, 0);
    expect(legMotion(300, 6, 6, total)[0]).toBe(300);
    const near = legMotion(300, 6, 6, total - 1)[0];
    expect(300 - near).toBeLessThan(1); // last second covers < 1 m: easing in
  });
  it("dead reckoning dwells at the next stop", () => {
    const sh = buildShape(line, stops);
    const atStop = deadReckon(sh, "M1", 300, 6, true, 30, 0, undefined, 16);
    expect(atStop).toBeCloseTo(400, 0); // reached S1 (~18 s) and is dwelling
    const later = deadReckon(sh, "M1", 300, 6, true, 45, 0, undefined, 16);
    expect(later).toBeGreaterThan(400);
  });
  it("uses learned segment speed and dwell when given", () => {
    const sh = buildShape(line, stops);
    const slow = deadReckon(sh, "M1", 410, 6, true, 20, 0, { speed: () => 2 });
    const fast = deadReckon(sh, "M1", 410, 6, true, 20, 0, { speed: () => 10 });
    expect(fast).toBeGreaterThan(slow);
  });
});

describe("BusEstimator", () => {
  const mk = () => { const e = new BusEstimator(); e.setRoute(geom); return e; };

  it("moves continuously between reports", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(100), bearing: 0, t: 0 }, 0);
    const s = sim(e, "b", 0, 25);
    expect(s[s.length - 1]).toBeGreaterThan(150);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1] - 1e-6);
  });

  it("corrects a new report smoothly, without teleporting or backing up", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(100), bearing: 0, t: 0 }, 0);
    sim(e, "b", 0, 30);
    // the real bus got further than the estimate
    e.report({ id: "b", route: "M1", ...at(420), bearing: 0, t: 30 }, 30);
    const s = sim(e, "b", 30, 40);
    for (let i = 1; i < s.length; i++) {
      expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(-1e-6);
      expect(s[i] - s[i - 1]).toBeLessThan(3); // ≤ 30 m/s at 15 fps
    }
  });

  it("holds rather than moving backward when slightly ahead of a report", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(100), bearing: 0, t: 0 }, 0);
    const before = sim(e, "b", 0, 30).pop()!;
    e.report({ id: "b", route: "M1", ...at(before - 80), bearing: 0, t: 30 }, 30);
    const s = sim(e, "b", 30, 34);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1] - 1e-6);
  });

  it("fades and jumps when more than 150 m ahead of a report", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(1000), bearing: 0, t: 0 }, 0);
    e.frame("b", 0);
    e.report({ id: "b", route: "M1", ...at(700), bearing: 0, t: 1 }, 1);
    e.frame("b", 1.2);
    const f1 = e.frame("b", 1.3)!;
    expect(f1.alpha).toBeLessThan(1);
    let f = f1;
    for (let t = 1.3; t < 3; t += 1 / 15) f = e.frame("b", t)!;
    expect(sOf(f.lat)).toBeLessThan(800);
    expect(f.alpha).toBeGreaterThan(0.5);
  });

  it("estimates speed from the last two reports, clamped", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(0), bearing: 0, t: 0 }, 0);
    e.report({ id: "b", route: "M1", ...at(1500), bearing: 0, t: 10 }, 10); // 150 m/s: absurd
    const st = (e as unknown as { state: Map<string, { v: number }> }).state.get("b")!;
    expect(st.v).toBeLessThanOrEqual(15);
  });

  it("fades a bus whose report is over 2 minutes old", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(100), bearing: 0, t: 0 }, 0);
    sim(e, "b", 0, 125, 0.5);
    expect(e.frame("b", 126)!.alpha).toBeLessThan(0.5);
  });

  it("picks the shape orientation that matches the bearing", () => {
    const e = mk();
    e.report({ id: "n", route: "M1", ...at(1000), bearing: 0, t: 0 }, 0);
    e.report({ id: "s", route: "M1", ...at(1000), bearing: 180, t: 0 }, 0);
    expect(sOf(e.frame("n", 10)!.lat)).toBeGreaterThan(1000);
    expect(sOf(e.frame("s", 10)!.lat)).toBeLessThan(1000);
  });

  it("falls back (undefined) for routes without a shape", () => {
    const e = mk();
    expect(e.report({ id: "x", route: "Q99", ...at(0), bearing: 0, t: 0 })).toBe(false);
    expect(e.frame("x")).toBeUndefined();
  });
});
