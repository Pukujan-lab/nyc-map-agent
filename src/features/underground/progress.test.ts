import { describe, expect, it } from "vitest";
import { CALIBRATION_MS, arrowState, calibrate, circularStats, correctedHeading, facingTracksHeading, headingJumped, steadyHeading } from "./cues";
import { compassAgrees, headingFromMovement, type Pt } from "./exits";
import { UNDO_MS, canUndo, riding, stepGetOff, type GetOff } from "./getoff";
import { detectStops, type MotionSample } from "./motion";
import { WIDE_AFTER_MS, atChoices, estimate, fromLive, onMotionStop, runTimeS, startProgress, userAt, type Stop } from "./progress";

// Lexington Av local stops, ~600–800 m apart.
const STOPS: Stop[] = [
  { id: "635", name: "14 St-Union Sq", at: [-73.9903, 40.7346] },
  { id: "634", name: "18 St", at: [-73.9867, 40.7389] },
  { id: "633", name: "23 St", at: [-73.9868, 40.7398] },
  { id: "632", name: "28 St", at: [-73.9840, 40.7431] },
  { id: "631", name: "33 St", at: [-73.9819, 40.7466] },
  { id: "630", name: "Grand Central-42 St", at: [-73.9768, 40.7518] },
];
const T0 = 1_700_000_000_000;

describe("trip progress", () => {
  it("a tap says 'At …' and wins over older live data", () => {
    const p = userAt(startProgress(STOPS, T0), 2, T0 + 1000);
    expect(estimate(p, T0 + 5000, false).label).toBe("At 23 St (you said)");
    const stale = fromLive(p, { stops: [["632", (T0 - 5000) / 1000]], atStop: "632" }, T0, T0 + 6000);
    expect(stale).toBe(p);
    const newer = fromLive(p, { stops: [["632", (T0 + 9000) / 1000]], atStop: "632" }, T0 + 10_000, T0 + 10_000);
    expect(newer.idx).toBe(3);
    expect(newer.source).toBe("live");
  });

  it("shows a train held at a station from the feed", () => {
    const p = startProgress(STOPS, T0);
    const nowS = T0 / 1000 + 600;
    const held = fromLive(p, { stops: [["633", nowS - 200, nowS - 120], ["632", nowS + 60]], atStop: "633" }, nowS * 1000, nowS * 1000);
    expect(held.held).toBe(true);
    expect(estimate(held, nowS * 1000 + 5000, true).label).toMatch(/^Held at 23 St \(live/);
  });

  it("places a moving train between the stops the feed says", () => {
    const nowS = T0 / 1000;
    const p = fromLive(startProgress(STOPS, T0), { stops: [["632", nowS + 40], ["631", nowS + 120]] }, T0, T0);
    expect(p.idx).toBe(2);
    expect(p.departed).toBe(true);
  });

  it("widens the timetable estimate with time and says only 'probably between' after 5 minutes", () => {
    const p = userAt(startProgress(STOPS, T0), 0, T0);
    const a = estimate(p, T0 + 90_000, false);
    expect(a.kind).toBe("between");
    expect(a.label).toMatch(/^Probably between .* \(estimated, no signal · 2 min since last update\)$/);
    const spanEarly = STOPS.indexOf(a.to!) - STOPS.indexOf(a.from);
    const later = estimate(p, T0 + 4 * 60_000, false);
    expect(STOPS.indexOf(later.to!) - STOPS.indexOf(later.from)).toBeGreaterThanOrEqual(spanEarly);
    const wide = estimate(p, T0 + WIDE_AFTER_MS + 1000, false);
    expect(wide.kind).toBe("probably-between");
    expect(STOPS.indexOf(wide.to!) - STOPS.indexOf(wide.from)).toBeGreaterThanOrEqual(2);
    expect(wide.uncertain).toBe(true);
  });

  it("offers the previous stop, the confirmed one and the next three", () => {
    expect(atChoices(userAt(startProgress(STOPS, T0), 2, T0)).map((i) => STOPS[i].name)).toEqual(["18 St", "23 St", "28 St", "33 St", "Grand Central-42 St"]);
  });
});

/** Synthetic accelerometer trace: rattling while moving, quiet while stopped. */
function trace(spans: Array<[number, "move" | "stop"]>, hz = 10): MotionSample[] {
  const out: MotionSample[] = [];
  let t = 0;
  for (const [secs, kind] of spans) {
    for (let i = 0; i < secs * hz; i++, t += 1 / hz) {
      const amp = kind === "move" ? 0.6 : 0.02;
      out.push({ t, mag: 0.3 + amp * Math.sin(t * 37.1) * Math.cos(t * 11.3) });
    }
  }
  return out;
}

describe("stop detector (motion)", () => {
  it("finds a station stop: quiet for 15–90 s, then moving again", () => {
    const ev = detectStops(trace([[60, "move"], [30, "stop"], [20, "move"]]));
    expect(ev).toHaveLength(1);
    expect(ev[0].kind).toBe("station");
    expect(ev[0].durationS).toBeGreaterThan(25);
    expect(ev[0].durationS).toBeLessThan(35);
  });

  it("calls a quiet spell over 90 s a long stop (held between stations)", () => {
    const ev = detectStops(trace([[60, "move"], [150, "stop"], [20, "move"]]));
    expect(ev).toHaveLength(1);
    expect(ev[0].kind).toBe("long");
  });

  it("ignores a short slowdown that is not a stop", () => {
    expect(detectStops(trace([[60, "move"], [6, "stop"], [60, "move"]]))).toHaveLength(0);
  });

  it("measures the run between two stops", () => {
    const ev = detectStops(trace([[30, "move"], [25, "stop"], [70, "move"], [25, "stop"], [10, "move"]]));
    expect(ev).toHaveLength(2);
    expect(ev[1].runS).toBeGreaterThan(65);
    expect(ev[1].runS).toBeLessThan(75);
  });
});

describe("advance and confirm from motion", () => {
  const p = userAt(startProgress(STOPS, T0), 2, T0);
  const run = runTimeS(STOPS[2], STOPS[3]);

  it("advances one stop on a normal station stop and asks to confirm", () => {
    const r = onMotionStop(p, { start: 0, end: 30, durationS: 30, kind: "station", runS: run }, T0 + 100_000);
    expect(r.progress.idx).toBe(3);
    expect(r.ask).toEqual({ kind: "confirm", stop: 3 });
    expect(estimate(r.progress, T0 + 101_000, false).label).toMatch(/^Probably at 28 St/);
  });

  it("does not advance on a long stop or one that does not fit the timetable; asks between", () => {
    expect(onMotionStop(p, { start: 0, end: 120, durationS: 120, kind: "long", runS: run }, T0).ask).toEqual({ kind: "between", from: 2, to: 3 });
    const odd = onMotionStop(p, { start: 0, end: 30, durationS: 30, kind: "station", runS: run * 5 }, T0);
    expect(odd.progress.idx).toBe(2);
    expect(odd.ask?.kind).toBe("between");
  });
});

describe('"Did you get off at …?"', () => {
  const off = [5];
  it("asks near a get-off stop, then for the platform, then offers Undo for a while", () => {
    let s: GetOff = riding();
    s = stepGetOff(s, { type: "near", stop: 4, getOffStops: off });
    expect(s.kind).toBe("riding");
    s = stepGetOff(s, { type: "near", stop: 5, getOffStops: off });
    expect(s).toMatchObject({ kind: "askOff", stop: 5 });
    s = stepGetOff(s, { type: "yes", now: 0 });
    expect(s.kind).toBe("askPlatform");
    s = stepGetOff(s, { type: "yes", now: 1000 });
    expect(s).toMatchObject({ kind: "confirmed", stop: 5 });
    expect(canUndo(s, 1000 + UNDO_MS - 1)).toBe(true);
    expect(canUndo(s, 1000 + UNDO_MS + 1)).toBe(false);
    expect(stepGetOff(s, { type: "undo", now: 1000 + UNDO_MS + 1 }).kind).toBe("confirmed");
    const undone = stepGetOff(s, { type: "undo", now: 2000 });
    expect(undone.kind).toBe("riding");
    // Not asked again for the same stop after an undo or a No.
    expect(stepGetOff(undone, { type: "near", stop: 5, getOffStops: off }).kind).toBe("riding");
  });

  it("No returns to riding; a different stop can be picked and confirmed", () => {
    const asked = stepGetOff(riding(), { type: "near", stop: 5, getOffStops: off });
    expect(stepGetOff(asked, { type: "no" }).kind).toBe("riding");
    let s = stepGetOff(asked, { type: "other" });
    expect(s.kind).toBe("pickOther");
    s = stepGetOff(s, { type: "pick", stop: 4 });
    expect(s).toMatchObject({ kind: "askPlatform", stop: 4 });
    expect(stepGetOff(s, { type: "yes", now: 0 })).toMatchObject({ kind: "confirmed", stop: 4 });
  });
});

describe("platform calibration and the pointer", () => {
  it("averages compass samples on a circle and rejects an unsteady run", () => {
    expect(circularStats([350, 10])!.mean).toBe(0);
    expect(circularStats([350, 10])!.spread).toBeLessThan(15);
    const steady = steadyHeading([88, 90, 92, 91, 89, 90]);
    expect(steady).toMatchObject({ ok: true, heading: 90 });
    expect(steadyHeading([0, 60, 120, 200, 300, 30])).toMatchObject({ ok: false, reason: "unsteady" });
    expect(steadyHeading([90, 91])).toMatchObject({ ok: false, reason: "too-few" });
  });

  it("option A and B headings, the offset and its expiry", () => {
    expect(facingTracksHeading(200, "right")).toBe(110);
    expect(facingTracksHeading(200, "left")).toBe(290);
    expect(facingTracksHeading(10, "right")).toBe(280);
    const cal = calibrate(200, 185, T0)!; // the compass reads 15° low
    expect(cal.offset).toBe(15);
    expect(correctedHeading(cal, 100, T0 + 1000)).toBe(115);
    expect(correctedHeading(cal, 100, T0 + CALIBRATION_MS + 1)).toBeNull();
    expect(calibrate(null, 185, T0)).toBeNull();
  });

  it("points at the exit (exit bearing minus corrected heading) and fades when it should", () => {
    const cal = calibrate(0, 0, T0)!;
    expect(arrowState({ cal, rawHeading: 30, interfered: false, exitBearing: 90, now: T0 + 1000 })).toEqual({ show: true, rotation: 60 });
    expect(arrowState({ cal, rawHeading: 300, interfered: false, exitBearing: 90, now: T0 + 1000 })).toEqual({ show: true, rotation: 150 });
    expect(arrowState({ cal: null, rawHeading: 30, interfered: false, exitBearing: 90, now: T0 })).toMatchObject({ show: false, reason: "no-calibration" });
    expect(arrowState({ cal, rawHeading: 30, interfered: false, exitBearing: 90, now: T0 + CALIBRATION_MS + 1 })).toMatchObject({ show: false, reason: "expired" });
    expect(arrowState({ cal, rawHeading: null, interfered: false, exitBearing: 90, now: T0 + 1000 })).toMatchObject({ show: false, reason: "no-compass" });
    expect(arrowState({ cal, rawHeading: 30, interfered: true, exitBearing: 90, now: T0 + 1000 })).toMatchObject({ show: false, reason: "interference" });
    expect(headingJumped({ deg: 10, at: 0 }, { deg: 70, at: 500 })).toBe(true);
    expect(headingJumped({ deg: 10, at: 0 }, { deg: 70, at: 3000 })).toBe(false);
    expect(headingJumped({ deg: 350, at: 0 }, { deg: 20, at: 500 })).toBe(false);
  });
});

describe("heading from the first steps above ground", () => {
  const start: Pt = [-73.9762, 40.7512];
  const north = (m: number): Pt => [start[0], start[1] + m / 111_320];
  it("needs about 12 m of good fixes, then gives the bearing", () => {
    expect(headingFromMovement([{ at: start, accuracy: 5 }, { at: north(5), accuracy: 5 }])).toBeNull();
    expect(headingFromMovement([{ at: start, accuracy: 5 }, { at: north(5), accuracy: 5 }, { at: north(14), accuracy: 6 }])).toBe(0);
    expect(headingFromMovement([{ at: start, accuracy: 80 }, { at: north(20), accuracy: 90 }])).toBeNull();
  });

  it("believes the compass only when it agrees with a trusted heading", () => {
    expect(compassAgrees(20, 0)).toBe(true);
    expect(compassAgrees(90, 0)).toBe(false);
    expect(compassAgrees(null, 0)).toBe(false);
  });
});
