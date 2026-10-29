/**
 * Moving vs stopped from the phone's motion sensor, for counting station
 * stops underground. Vibration energy (the spread of the acceleration
 * magnitude over a short window) with hysteresis: a train in motion rattles,
 * a train in a station is quiet. A quiet spell of 15–90 s that ends in motion
 * is probably a station stop; longer is "held". Approximate by nature. The
 * samples stay in memory on the device and are never logged or sent.
 * Pure, for tests: feed samples to `stepDetector`, or a whole trace to `detectStops`.
 */

export interface MotionSample {
  /** Seconds. */
  t: number;
  /** Acceleration magnitude without gravity, m/s². */
  mag: number;
}

export interface StopEvent {
  /** Seconds. */
  start: number;
  end: number;
  durationS: number;
  kind: "station" | "long";
  /** Seconds of motion between the previous stop's end and this stop's start (null for the first). */
  runS: number | null;
}

export const WINDOW_S = 2;
/** Energy (std dev, m/s²) above which the train is moving, and below which it is still. */
export const MOVING = 0.18;
export const STILL = 0.07;
/** A quiet spell shorter than this is a slowdown, not a stop. */
export const MIN_STOP_S = 15;
export const LONG_STOP_S = 90;
/** Motion must last this long before a stop counts as over. */
export const RESUME_S = 3;

export interface DetectorState {
  window: MotionSample[];
  moving: boolean;
  /** When the current quiet spell began. */
  stillSince: number | null;
  /** When motion resumed after a quiet spell (pending confirmation). */
  resumeSince: number | null;
  lastStopEnd: number | null;
}

export const initialDetector = (): DetectorState => ({ window: [], moving: true, stillSince: null, resumeSince: null, lastStopEnd: null });

function energy(w: MotionSample[]): number {
  if (w.length < 2) return 0;
  const mean = w.reduce((s, x) => s + x.mag, 0) / w.length;
  return Math.sqrt(w.reduce((s, x) => s + (x.mag - mean) ** 2, 0) / w.length);
}

/** One sample in, maybe one stop event out. */
export function stepDetector(st: DetectorState, s: MotionSample): { state: DetectorState; event: StopEvent | null } {
  const window = [...st.window.filter((x) => s.t - x.t < WINDOW_S), s];
  const e = energy(window);
  let { moving, stillSince, resumeSince, lastStopEnd } = st;
  let event: StopEvent | null = null;
  if (moving && e < STILL) {
    moving = false;
    if (resumeSince === null) stillSince = s.t;
    resumeSince = null;
  } else if (!moving && e > MOVING) {
    moving = true;
    resumeSince = s.t;
  }
  if (moving && resumeSince !== null && stillSince !== null && s.t - resumeSince >= RESUME_S) {
    const durationS = resumeSince - stillSince;
    if (durationS >= MIN_STOP_S) {
      event = { start: stillSince, end: resumeSince, durationS, kind: durationS > LONG_STOP_S ? "long" : "station", runS: lastStopEnd === null ? null : stillSince - lastStopEnd };
      lastStopEnd = resumeSince;
    }
    stillSince = null;
    resumeSince = null;
  }
  return { state: { window, moving, stillSince, resumeSince, lastStopEnd }, event };
}

export function detectStops(trace: MotionSample[]): StopEvent[] {
  let st = initialDetector();
  const out: StopEvent[] = [];
  for (const s of trace) {
    const r = stepDetector(st, s);
    st = r.state;
    if (r.event) out.push(r.event);
  }
  return out;
}
