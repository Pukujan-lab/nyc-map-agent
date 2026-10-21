import { describe, expect, it } from "vitest";
import { ease, followPose, undergroundShare } from "./followCam";
import type { StaticSystem } from "./model";

// 1 km straight east-west shape: first half underground, second half elevated.
const n = 51;
const c = Array.from({ length: n }, (_, i) => [-73.9 + i * 0.000236, 40.75] as [number, number]);
const m = c.map((_, i) => i * 20);
const g = c.map((_, i) => (i < 25 ? "underground" : "elevated"));
const sys = { system: "subway", routes: {}, lines: { type: "FeatureCollection", features: [] }, stations: { type: "FeatureCollection", features: [] }, shapes: { X: { c, m, g } }, stopM: {} } as unknown as StaticSystem;

describe("follow-train camera", () => {
  it("reads deep tunnel as underground, open track as not, and ramps across the portal", () => {
    expect(undergroundShare(sys, "X", 100)).toBeGreaterThan(0.95);
    expect(undergroundShare(sys, "X", 900)).toBeLessThan(0.05);
    // The ramp up to the deck lifts the portal; somewhere along it the share is partial.
    const shares = Array.from({ length: 41 }, (_, i) => undergroundShare(sys, "X", 100 + i * 20));
    expect(shares.some((p) => p > 0.3 && p < 0.7)).toBe(true);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeLessThanOrEqual(shares[i - 1] + 1e-9);
  });
  it("puts the eye behind the train on the track and above the deck", () => {
    const pose = followPose(sys, "X", 900, 1, 0)!;
    expect(pose.eye[0]).toBeLessThan(pose.train.lon);
    expect(pose.look[0]).toBeGreaterThan(pose.train.lon);
    expect(pose.eyeAlt).toBeGreaterThan(pose.train.z);
  });
  it("goes high and far back in x-ray", () => {
    const a = followPose(sys, "X", 900, 1, 0)!, b = followPose(sys, "X", 900, 1, 1)!;
    expect(b.eyeAlt - b.train.z).toBeGreaterThan(100);
    expect(b.eye[0]).toBeLessThan(a.eye[0]);
  });
  it("eases toward a jumped prediction instead of snapping", () => {
    const next = ease(0, 300, 1 / 60, 1.2, 2000);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
    expect(ease(0, 5000, 1 / 60, 1.2, 2000)).toBe(5000);
  });
});
