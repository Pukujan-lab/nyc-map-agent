/**
 * Above-ground calibration for when no platform calibration happened (the
 * person had already left the station, or opened the app late): street
 * alignment, heading from walking, a landmark question, and when to offer
 * them. Pure, for tests. Offered by a banner; sensors start only from a tap.
 */
import { angleDiff, bearing, metres, type Pt } from "./exits";

export interface Line {
  name: string;
  coords: Pt[];
}

const M = 111_320;

/** How long an above-ground correction is trusted before it should be checked again. */
export const SURFACE_CAL_MS = 5 * 60_000;

/** The named street segment nearest a point, with its bearing (a→b) and distance. */
export function streetBearingAt(lines: Line[], at: Pt, maxM = 40): { name: string; bearing: number; seg: [Pt, Pt]; offM: number } | null {
  const kx = M * Math.cos((at[1] * Math.PI) / 180);
  let best: { name: string; seg: [Pt, Pt]; d: number } | null = null;
  for (const l of lines) {
    for (let i = 1; i < l.coords.length; i++) {
      const a = l.coords[i - 1];
      const b = l.coords[i];
      const ax = (a[0] - at[0]) * kx, ay = (a[1] - at[1]) * M;
      const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * M;
      const l2 = dx * dx + dy * dy;
      if (!l2) continue;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (!best || d < best.d) best = { name: l.name, seg: [a, b], d };
    }
  }
  if (!best || best.d > maxM) return null;
  return { name: best.name, bearing: bearing(best.seg[0], best.seg[1]), seg: best.seg, offM: Math.round(best.d) };
}

/** Where the infinite line through segment s crosses segment-line u, as distance along s's direction from `at` (m). */
function alongTo(s: [Pt, Pt], u: [Pt, Pt], at: Pt): number | null {
  const kx = M * Math.cos((at[1] * Math.PI) / 180);
  const xy = (p: Pt): Pt => [(p[0] - at[0]) * kx, (p[1] - at[1]) * M];
  const [p1, p2] = [xy(s[0]), xy(s[1])];
  const [p3, p4] = [xy(u[0]), xy(u[1])];
  const den = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  if (Math.abs(den) < 1e-6) return null;
  const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / den;
  // Only crossings that fall on (or within 15 m of) the other street's segment.
  const ux = p4[0] - p3[0], uy = p4[1] - p3[1];
  const ix = p1[0] + t * (p2[0] - p1[0]), iy = p1[1] + t * (p2[1] - p1[1]);
  const ul = Math.hypot(ux, uy);
  const s2 = ((ix - p3[0]) * ux + (iy - p3[1]) * uy) / (ul * ul);
  if (s2 < -15 / ul || s2 > 1 + 15 / ul) return null;
  const dir = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  return (ix * (p2[0] - p1[0]) + iy * (p2[1] - p1[1])) / dir;
}

export interface StreetOption {
  label: string;
  bearing: number;
}

/**
 * The two ways along the street you stand on, named by the next cross street
 * each way: "toward 7 Avenue" / "toward 8 Avenue". Falls back to "toward the NE".
 */
export function streetOptions(lines: Line[], at: Pt, maxAheadM = 300): { street: string; options: [StreetOption, StreetOption] } | null {
  const s = streetBearingAt(lines, at);
  if (!s) return null;
  let ahead: { name: string; d: number } | null = null;
  let behind: { name: string; d: number } | null = null;
  for (const l of lines) {
    if (l.name === s.name) continue;
    for (let i = 1; i < l.coords.length; i++) {
      const d = alongTo(s.seg, [l.coords[i - 1], l.coords[i]], at);
      if (d === null || Math.abs(d) > maxAheadM || Math.abs(d) < 3) continue;
      if (d > 0 && (!ahead || d < ahead.d)) ahead = { name: l.name, d };
      if (d < 0 && (!behind || -d < behind.d)) behind = { name: l.name, d: -d };
    }
  }
  const back = (s.bearing + 180) % 360;
  const word = (b: number) => `toward the ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(b / 45) % 8]}`;
  return {
    street: s.name,
    options: [
      { label: ahead ? `toward ${ahead.name}` : word(s.bearing), bearing: s.bearing },
      { label: behind ? `toward ${behind.name}` : word(back), bearing: back },
    ],
  };
}

/** The tap resolves the street's two directions into the heading the phone points. */
export function headingFromStreetTap(streetBearing: number, tapped: 0 | 1): number {
  return tapped === 0 ? ((streetBearing % 360) + 360) % 360 : (((streetBearing + 180) % 360) + 360) % 360;
}

/** Movement against compass: when they differ by more than `tolDeg`, trust movement; the offset corrects the compass. */
export function movementCorrection(compass: number | null, movement: number | null, tolDeg = 30): { disagree: boolean; offset: number | null } {
  if (compass === null || movement === null) return { disagree: false, offset: null };
  const d = angleDiff(compass, movement);
  return { disagree: Math.abs(d) > tolDeg, offset: Math.round(d) };
}

/** True when compass and movement have disagreed by more than `tolDeg` throughout the last `forMs`. */
export function disagreementTrigger(samples: Array<{ t: number; compass: number; movement: number }>, now: number, tolDeg = 30, forMs = 10_000): boolean {
  const recent = samples.filter((s) => now - s.t <= forMs + 2000);
  if (!recent.length || now - recent[0].t < forMs) return false;
  return recent.every((s) => Math.abs(angleDiff(s.compass, s.movement)) > tolDeg);
}

export type LandmarkAnswer = "front" | "behind" | "left" | "right";

/**
 * The nearest landmark within `maxM` to ask about ("Is the Empire State
 * Building in front of you?"). Takes any list, so it works with the hero
 * landmarks on main (src/lib/map/landmarks.ts) and with a larger set later
 * (integration point for PR #393: pass its list here).
 */
export function landmarkToAsk(at: Pt, landmarks: Array<{ name: string; at: Pt }>, maxM = 1500): { name: string; bearing: number; distM: number } | null {
  let best: { name: string; bearing: number; distM: number } | null = null;
  for (const l of landmarks) {
    const d = metres(at, l.at);
    if (d >= 30 && d <= maxM && (!best || d < best.distM)) best = { name: l.name, bearing: bearing(at, l.at), distM: Math.round(d) };
  }
  return best;
}

/** Which way the person faces, from where they say the landmark is. */
export function headingFromLandmark(landmarkBearing: number, answer: LandmarkAnswer): number {
  const off = { front: 0, behind: 180, left: 90, right: -90 }[answer];
  return (((landmarkBearing + off) % 360) + 360) % 360;
}

/** Why to offer the above-ground calibration banner now, or null. */
export type LateOpenReason = "gps-back-near-entrance" | "compass-disagrees" | "after-subway-trip";

export function lateOpenTrigger(p: {
  /** Gap without a usable GPS fix that just ended (ms), and how long ago it ended. */
  gpsGapMs: number | null;
  recoveredAgoMs: number | null;
  /** Distance from the recovered fix to the nearest subway entrance (m). */
  entranceM: number | null;
  /** disagreementTrigger result. */
  compassDisagrees: boolean;
  /** The app opened above ground soon after a subway trip it saved (first open only). */
  firstOpenAfterTrip: boolean;
  /** The person dismissed or finished the banner already. */
  dismissed: boolean;
}): LateOpenReason | null {
  if (p.dismissed) return null;
  if (p.gpsGapMs !== null && p.gpsGapMs >= 60_000 && p.recoveredAgoMs !== null && p.recoveredAgoMs <= 60_000 && p.entranceM !== null && p.entranceM <= 150) return "gps-back-near-entrance";
  if (p.compassDisagrees) return "compass-disagrees";
  if (p.firstOpenAfterTrip) return "after-subway-trip";
  return null;
}

/** The first open above ground after a subway trip: a saved trip under 3 hours old, not yet offered. */
export function openedAfterTrip(savedAt: number | null, hadSubwayTrip: boolean, alreadyOffered: boolean, now: number, withinMs = 3 * 3_600_000): boolean {
  return !alreadyOffered && hadSubwayTrip && savedAt !== null && now - savedAt <= withinMs && now >= savedAt;
}
