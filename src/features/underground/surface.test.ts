import { describe, expect, it } from "vitest";
import { headingFromMovement, type Pt } from "./exits";
import {
  disagreementTrigger,
  headingFromLandmark,
  headingFromStreetTap,
  landmarkToAsk,
  lateOpenTrigger,
  movementCorrection,
  openedAfterTrip,
  streetBearingAt,
  streetOptions,
} from "./surface";

// A simplified Manhattan grid near Times Sq: W 42 St runs roughly WNW–ESE, avenues cross it.
const lat = 40.7565;
const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
const east = (m: number) => m / kx;
const north = (m: number) => m / 111_320;
const origin: Pt = [-73.988, lat];
const at = (x: number, y: number): Pt => [origin[0] + east(x), origin[1] + north(y)];
const lines = [
  { name: "West 42nd Street", coords: [at(-400, 0), at(400, 0)] }, // runs east
  { name: "7th Avenue", coords: [at(120, -300), at(120, 300)] }, // 120 m east
  { name: "8th Avenue", coords: [at(-150, -300), at(-150, 300)] }, // 150 m west
];

describe("street alignment", () => {
  it("takes the bearing of the nearest street segment, and nothing when far from a street", () => {
    const s = streetBearingAt(lines, at(10, 8))!;
    expect(s.name).toBe("West 42nd Street");
    expect(s.bearing).toBe(90);
    expect(s.offM).toBe(8);
    expect(streetBearingAt(lines, at(10, 80))).toBeNull();
  });

  it("names the two ways along the street by the next cross street each way", () => {
    const o = streetOptions(lines, at(10, 5))!;
    expect(o.street).toBe("West 42nd Street");
    expect(o.options).toEqual([
      { label: "toward 7th Avenue", bearing: 90 },
      { label: "toward 8th Avenue", bearing: 270 },
    ]);
    const lonely = streetOptions([lines[0]], at(10, 5))!;
    expect(lonely.options.map((x) => x.label)).toEqual(["toward the E", "toward the W"]);
  });

  it("resolves the direction from the tap", () => {
    expect(headingFromStreetTap(90, 0)).toBe(90);
    expect(headingFromStreetTap(90, 1)).toBe(270);
    expect(headingFromStreetTap(300, 1)).toBe(120);
  });
});

describe("movement heading against the compass", () => {
  it("takes the heading from 10–15 m of walking with good accuracy only", () => {
    const fixes = [0, 4, 8, 13].map((m) => ({ at: at(m, 0), accuracy: 12 }));
    expect(headingFromMovement(fixes, 12, 20)).toBe(90);
    expect(headingFromMovement(fixes.map((f) => ({ ...f, accuracy: 35 })), 12, 20)).toBeNull();
  });

  it("trusts movement when it differs from the compass by more than 30°", () => {
    expect(movementCorrection(40, 90)).toEqual({ disagree: true, offset: 50 });
    expect(movementCorrection(80, 90)).toEqual({ disagree: false, offset: 10 });
    expect(movementCorrection(null, 90)).toEqual({ disagree: false, offset: null });
  });

  it("triggers only after 10 s of steady disagreement", () => {
    const s = (t: number, compass: number) => ({ t, compass, movement: 90 });
    expect(disagreementTrigger([s(0, 20), s(5000, 25), s(10_000, 30)], 10_000)).toBe(true);
    expect(disagreementTrigger([s(0, 20), s(5000, 25)], 5000)).toBe(false);
    expect(disagreementTrigger([s(0, 20), s(5000, 85), s(10_000, 30)], 10_000)).toBe(false);
  });
});

describe("landmark check", () => {
  const marks = [
    { name: "Empire State Building", at: [-73.98566, 40.74844] as Pt },
    { name: "Statue of Liberty", at: [-74.04452, 40.68925] as Pt },
  ];
  it("asks about the nearest landmark within 1.5 km", () => {
    const q = landmarkToAsk([-73.9857, 40.7577], marks)!;
    expect(q.name).toBe("Empire State Building");
    expect(q.bearing).toBeGreaterThan(170);
    expect(q.bearing).toBeLessThan(190);
    expect(landmarkToAsk([-73.95, 40.8], marks)).toBeNull();
  });

  it("turns the answer into the way the person faces", () => {
    expect(headingFromLandmark(180, "front")).toBe(180);
    expect(headingFromLandmark(180, "behind")).toBe(0);
    expect(headingFromLandmark(180, "left")).toBe(270);
    expect(headingFromLandmark(180, "right")).toBe(90);
  });
});

describe("late-open banner", () => {
  const none = { gpsGapMs: null, recoveredAgoMs: null, entranceM: null, compassDisagrees: false, firstOpenAfterTrip: false, dismissed: false };
  it("offers when GPS comes back near a subway entrance after a gap", () => {
    expect(lateOpenTrigger({ ...none, gpsGapMs: 120_000, recoveredAgoMs: 5000, entranceM: 90 })).toBe("gps-back-near-entrance");
    expect(lateOpenTrigger({ ...none, gpsGapMs: 20_000, recoveredAgoMs: 5000, entranceM: 90 })).toBeNull();
    expect(lateOpenTrigger({ ...none, gpsGapMs: 120_000, recoveredAgoMs: 5000, entranceM: 400 })).toBeNull();
  });

  it("offers when the compass disagrees with walking, or on the first open after a trip; never after dismissal", () => {
    expect(lateOpenTrigger({ ...none, compassDisagrees: true })).toBe("compass-disagrees");
    expect(lateOpenTrigger({ ...none, firstOpenAfterTrip: true })).toBe("after-subway-trip");
    expect(lateOpenTrigger({ ...none, compassDisagrees: true, dismissed: true })).toBeNull();
    expect(openedAfterTrip(0, true, false, 3_600_000)).toBe(true);
    expect(openedAfterTrip(0, true, true, 3_600_000)).toBe(false);
    expect(openedAfterTrip(0, true, false, 4 * 3_600_000)).toBe(false);
    expect(openedAfterTrip(0, false, false, 1000)).toBe(false);
  });
});
