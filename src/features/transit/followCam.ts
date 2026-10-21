import { trackPoint, type StaticSystem } from "./model";

/**
 * Follow-train camera arithmetic, kept free of WebGL so it can be tested.
 * The camera rides the route shape itself: the eye sits on the track a set
 * distance behind the train and looks at a point on the track ahead, so curves
 * are followed rather than cut. How far back and how high blend between an
 * above-ground pose (deck height, just behind and above) and an x-ray pose
 * (high and further back, looking down through a faded ground).
 */
export const ABOVE = { back: 55, up: 16, ahead: 80 };
export const XRAY = { back: 170, up: 120, ahead: 40 };
/** Half-width of the window, in metres of track, that decides how "underground" the train is. */
export const PORTAL_WINDOW_M = 160;

/**
 * Share of the track around `m` (±PORTAL_WINDOW_M, weighted toward the train)
 * that is underground: 0 on open track, 1 deep in a tunnel, and a ramp across
 * a portal, so the switch to x-ray is a blend rather than a cut.
 */
export function undergroundShare(sys: StaticSystem, route: string, m: number): number {
  let w = 0, u = 0;
  for (let d = -PORTAL_WINDOW_M; d <= PORTAL_WINDOW_M; d += 20) {
    const p = trackPoint(sys, route, m + d);
    if (!p) continue;
    const k = 1 - Math.abs(d) / (PORTAL_WINDOW_M + 20);
    w += k;
    if (p.grade === "underground") u += k;
  }
  return w ? u / w : 0;
}

export type FollowPose = { eye: [number, number]; eyeAlt: number; look: [number, number]; lookAlt: number; train: { lon: number; lat: number; z: number } };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Camera eye and look-at point for a train at `m` moving `forward`, at x-ray blend `u` (0..1). */
export function followPose(sys: StaticSystem, route: string, m: number, forward: number, u: number): FollowPose | null {
  const train = trackPoint(sys, route, m);
  if (!train) return null;
  const back = lerp(ABOVE.back, XRAY.back, u), up = lerp(ABOVE.up, XRAY.up, u), ahead = lerp(ABOVE.ahead, XRAY.ahead, u);
  const behind = trackPoint(sys, route, m - forward * back) ?? train;
  const front = trackPoint(sys, route, m + forward * ahead) ?? train;
  const deck = Math.max(0, train.z);
  return {
    eye: [behind.lon, behind.lat],
    eyeAlt: deck + up,
    look: [front.lon, front.lat],
    lookAlt: Math.max(0, lerp(Math.max(0, front.z) + 2, 0, u)),
    train: { lon: train.lon, lat: train.lat, z: deck },
  };
}

/**
 * Frame-rate independent easing toward a moving target. A feed update can move
 * the predicted position by hundreds of metres; this glides there instead.
 * Beyond `snapM` (another trip, or the train looped) it jumps.
 */
export function ease(current: number, target: number, dtS: number, tauS: number, snap = Infinity): number {
  if (!Number.isFinite(current) || Math.abs(target - current) > snap) return target;
  return current + (target - current) * (1 - Math.exp(-dtS / tauS));
}
