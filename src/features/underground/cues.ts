/**
 * Cues a disoriented person can see and feel: the train they just rode, the
 * station's own exit signs, and landmarks above ground. No compass words
 * (north, left, right) underground. Pure, for tests.
 */
import { angleDiff, bearing, metres, type LandmarkCandidate, type Pt } from "./exits";

export type TrainEnd = "front" | "back";

const M = 111_320;

/**
 * Whether an exit lies toward the front or the back of the train, from the
 * ride's line (drawn in the direction of travel) near the station. The exit
 * and the station centre are projected onto the line's direction at the
 * station; the difference says ahead or behind. Null when it cannot be told
 * reliably: no line, the exit too far off the line, or too close to the middle.
 */
/**
 * Direction of travel along a line at the point nearest `at`: a unit vector in
 * local metres (x east, y north), its compass bearing, and how far `at` is from the line.
 */
export function directionAt(line: Pt[] | null, at: Pt): { dir: Pt; bearing: number; offM: number } | null {
  if (!line || line.length < 2) return null;
  const kx = M * Math.cos((at[1] * Math.PI) / 180);
  const xy = (p: Pt): Pt => [(p[0] - at[0]) * kx, (p[1] - at[1]) * M];
  let best: { d: number; dir: Pt } | null = null;
  for (let i = 1; i < line.length; i++) {
    const a = xy(line[i - 1]);
    const b = xy(line[i]);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (!l2) continue;
    const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / l2));
    const d = Math.hypot(a[0] + t * dx, a[1] + t * dy);
    if (!best || d < best.d) best = { d, dir: [dx / Math.sqrt(l2), dy / Math.sqrt(l2)] };
  }
  if (!best) return null;
  const deg = (Math.atan2(best.dir[0], best.dir[1]) * 180) / Math.PI;
  return { dir: best.dir, bearing: Math.round((deg + 360) % 360), offM: best.d };
}

/**
 * How far along the platform the exit is from the station point, in metres:
 * positive toward the front of the train, negative toward the back. The exit
 * is projected onto the ride line's direction at the station. Null when there
 * is no line or the exit (or station) is too far off the line to say.
 * Measured from the station point, not from where the person stands.
 */
export function alongPlatform(line: Pt[] | null, station: Pt, exit: Pt, maxOffM = 150): number | null {
  const best = directionAt(line, station);
  if (!best || best.offM > maxOffM) return null;
  const kx = M * Math.cos((station[1] * Math.PI) / 180);
  const e: Pt = [(exit[0] - station[0]) * kx, (exit[1] - station[1]) * M];
  const off = Math.abs(e[0] * best.dir[1] - e[1] * best.dir[0]);
  if (off > maxOffM) return null;
  return Math.round(e[0] * best.dir[0] + e[1] * best.dir[1]);
}

/** Front or back of the train; null when the exit is within `minM` of the middle or it cannot be told. */
export function trainEndOf(line: Pt[] | null, station: Pt, exit: Pt, minM = 25, maxOffM = 150): TrainEnd | null {
  const along = alongPlatform(line, station, exit, maxOffM);
  if (along === null || Math.abs(along) < minM) return null;
  return along > 0 ? "front" : "back";
}

/** "Exit about 80 m toward the front (approximate)". */
export function alongLabel(alongM: number | null): string | null {
  if (alongM === null) return null;
  const m = Math.max(10, Math.round(Math.abs(alongM) / 10) * 10);
  if (Math.abs(alongM) < 25) return "Exit near the middle of the platform (approximate)";
  return `Exit about ${m} m toward the ${alongM > 0 ? "front" : "back"} (approximate)`;
}

/**
 * Calibration option B: the person faces the tracks and taps which way the
 * train left. Train went to their right → they face 90° anticlockwise of the
 * direction of travel; to their left → 90° clockwise.
 */
export function facingTracksHeading(trackBearing: number, trainWent: "left" | "right"): number {
  return (((trackBearing + (trainWent === "right" ? -90 : 90)) % 360) + 360) % 360;
}

/** What to do with that: "Your exit is near the FRONT of the train — walk the way the train was going." */
export function trainCue(end: TrainEnd | null): string | null {
  if (end === "front") return "Your exit is near the FRONT of the train. Walk the way the train was going.";
  if (end === "back") return "Your exit is near the BACK of the train. Walk back the way the train came from.";
  return null;
}

const SIGN_TYPES: Record<string, string> = {
  street: "St", avenue: "Av", place: "Pl", boulevard: "Blvd", road: "Rd", drive: "Dr", parkway: "Pkwy",
  square: "Sq", lane: "Ln", terrace: "Ter", plaza: "Plz", court: "Ct", highway: "Hwy", expressway: "Expwy",
};
const SIGN_DIRS: Record<string, string> = { north: "N", south: "S", east: "E", west: "W" };

/** Street names as MTA exit signs print them: "West 42nd Street" → "W 42 St", "7th Avenue" → "7 Av". */
export function signStreet(name: string): string {
  const words = name.trim().split(/\s+/);
  return words
    .map((w, i) => {
      const k = w.toLowerCase().replace(/\.$/, "");
      if (i === 0 && SIGN_DIRS[k] && words.length > 1) return SIGN_DIRS[k];
      if (/^\d+(st|nd|rd|th)$/.test(k)) return k.replace(/(st|nd|rd|th)$/, "");
      if (i > 0 && SIGN_TYPES[k]) return SIGN_TYPES[k];
      return w;
    })
    .join(" ");
}

/** The sign to follow: "Exit · W 42 St & 7 Av · NE corner". Null without saved street names. */
export function signText(streets: string[] | null, corner: string | null): string | null {
  if (!streets?.length) return null;
  return `Exit · ${streets.map(signStreet).join(" & ")}${corner ? ` · ${corner} corner` : ""}`;
}

export interface LandmarkCue {
  name: string;
  where: "front" | "behind";
}

/**
 * One or two things to look for on surfacing, placed relative to facing the
 * destination: in front (within 45°) is best, behind also works ("if it is in
 * front of you, turn around"). Tall landmarks within 900 m, storefronts within 60 m.
 */
export function pickLandmarks(from: Pt, toward: number, candidates: LandmarkCandidate[], max = 2): LandmarkCue[] {
  const scored: Array<LandmarkCue & { score: number }> = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.name)) continue;
    const d = metres(from, c.at);
    if (d < 8 || d > (c.tall ? 900 : 60)) continue;
    const off = Math.abs(angleDiff(toward, bearing(from, c.at)));
    const where = off <= 45 ? "front" : off >= 135 ? "behind" : null;
    if (!where) continue;
    seen.add(c.name);
    // Prefer in front, then tall, then near.
    scored.push({ name: c.name, where, score: (where === "front" ? 0 : 1000) + (c.tall ? 0 : 500) + d / 10 });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map(({ name, where }) => ({ name, where }));
}

/** "Chrysler Building should be in front of you. If it is behind you, turn around." */
export function landmarkLine(c: LandmarkCue): string {
  return c.where === "front"
    ? `${c.name} should be in front of you. If it is behind you, turn around.`
    : `${c.name} should be behind you. If it is in front of you, turn around.`;
}

/** The question for the assistant when the person describes what they see. */
export function describePrompt(p: { station: string; sign: string | null; destination: string | null; seen: string }): string {
  return [
    `I just came up from the subway at ${p.station}${p.sign ? `, by the ${p.sign}` : ""}${p.destination ? `, going to ${p.destination}` : ""}.`,
    `What I can see: ${p.seen.trim()}`,
    "Which way should I walk? Answer with things I can see (signs, storefronts, landmarks, the street I am on), not compass directions or left/right.",
  ].join(" ");
}

/** Circular mean of compass headings (0–359) and their circular standard deviation in degrees. */
export function circularStats(degs: number[]): { mean: number; spread: number } | null {
  if (!degs.length) return null;
  let s = 0;
  let c = 0;
  for (const d of degs) {
    s += Math.sin((d * Math.PI) / 180);
    c += Math.cos((d * Math.PI) / 180);
  }
  const r = Math.hypot(s, c) / degs.length;
  const mean = (((Math.atan2(s, c) * 180) / Math.PI) + 360) % 360;
  const spread = r >= 1 ? 0 : (Math.sqrt(-2 * Math.log(Math.max(r, 1e-9))) * 180) / Math.PI;
  return { mean: Math.round(mean), spread: Math.round(spread) };
}

export const CALIBRATION_SAMPLE_MS = 5000;
export const MAX_SPREAD_DEG = 20;

/**
 * Five seconds of compass samples held along the train's direction: the mean,
 * or a rejection when they wandered too much (try again) or were too few.
 */
export function steadyHeading(degs: number[], maxSpread = MAX_SPREAD_DEG, minSamples = 5): { ok: true; heading: number; spread: number } | { ok: false; reason: "too-few" | "unsteady"; spread: number | null } {
  if (degs.length < minSamples) return { ok: false, reason: "too-few", spread: null };
  const st = circularStats(degs)!;
  return st.spread > maxSpread ? { ok: false, reason: "unsteady", spread: st.spread } : { ok: true, heading: st.mean, spread: st.spread };
}

/** How long a platform calibration is trusted: phones drift, and the person walks off the platform. */
export const CALIBRATION_MS = 2 * 60_000;

export interface Calibration {
  /** Add to the raw compass reading to get the true heading. */
  offset: number;
  at: number;
}

/**
 * Platform calibration: the person points the phone along the tracks toward
 * where the train was going; the difference from the track bearing (from the
 * ride line near the station) is the compass's error right now. Null when
 * there is no track direction or no compass reading.
 */
export function calibrate(trackBearing: number | null, rawHeading: number | null, now: number): Calibration | null {
  if (trackBearing === null || rawHeading === null) return null;
  return { offset: angleDiff(rawHeading, trackBearing), at: now };
}

/** The corrected heading while the calibration is fresh, else null (fall back to signs and landmarks). */
export function correctedHeading(cal: Calibration | null, rawHeading: number | null, now: number, ttlMs = CALIBRATION_MS): number | null {
  if (!cal || rawHeading === null || now - cal.at > ttlMs || now < cal.at) return null;
  return Math.round((((rawHeading + cal.offset) % 360) + 360) % 360);
}

/** Degrees to rotate an on-screen pointer (0 = top of the phone) so it points at `target`. */
export function pointerRotation(heading: number, target: number): number {
  return Math.round(angleDiff(heading, target));
}

/** A raw heading that swings this far within a second means magnetic interference (steel, a passing train). */
export const JUMP_DEG = 45;
export const JUMP_MS = 1000;

/** True when the raw compass jumped more than JUMP_DEG within JUMP_MS. */
export function headingJumped(prev: { deg: number; at: number } | null, next: { deg: number; at: number }): boolean {
  if (!prev) return false;
  return next.at - prev.at <= JUMP_MS && Math.abs(angleDiff(prev.deg, next.deg)) > JUMP_DEG;
}

export type ArrowState = { show: true; rotation: number } | { show: false; reason: "no-calibration" | "expired" | "no-compass" | "interference" };

/**
 * The approximate arrow toward the exit, underground, after a platform
 * calibration only. Rotation is the exit's bearing minus the corrected heading.
 * Hidden when the calibration expired, the compass stopped, or it jumped
 * (interference, which holds until the person calibrates again).
 */
export function arrowState(p: { cal: Calibration | null; rawHeading: number | null; interfered: boolean; exitBearing: number | null; now: number }): ArrowState {
  if (!p.cal || p.exitBearing === null) return { show: false, reason: "no-calibration" };
  if (p.now - p.cal.at > CALIBRATION_MS) return { show: false, reason: "expired" };
  if (p.rawHeading === null) return { show: false, reason: "no-compass" };
  if (p.interfered) return { show: false, reason: "interference" };
  const h = correctedHeading(p.cal, p.rawHeading, p.now);
  return h === null ? { show: false, reason: "expired" } : { show: true, rotation: pointerRotation(h, p.exitBearing) };
}
