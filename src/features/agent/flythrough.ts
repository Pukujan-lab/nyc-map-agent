import type { LngLatTuple, Trip } from "./schema";

/**
 * The immersive trip preview as a pure timeline: walk at street level with
 * turn callouts → descend into the station at the chosen entrance → ride
 * (x-ray when underground, the real viaduct when elevated) with stop callouts
 * and any transfer walk → rise at the recommended exit → walk out.
 */
export type SegmentKind = "walk" | "drive" | "descend" | "ride" | "ascend";
export interface Segment {
  kind: SegmentKind;
  label: string;
  coords: LngLatTuple[];
  /** Real-world seconds this part of the trip takes. */
  realS: number;
  underground: boolean;
  route?: string;
  callouts: Array<{ f: number; text: string }>;
}
export interface Pose { center: LngLatTuple; bearing: number; pitch: number; zoom: number }

const R = 6371000;
function dist(a: LngLatTuple, b: LngLatTuple): number {
  const k = Math.PI / 180;
  const x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * k);
  const y = (b[1] - a[1]) * k;
  return Math.sqrt(x * x + y * y) * R;
}
export function bearing(a: LngLatTuple, b: LngLatTuple): number {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  return ((Math.atan2(dx, b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}
function cumulative(coords: LngLatTuple[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + dist(coords[i - 1], coords[i]));
  return out;
}
/** Point at fraction f (0..1) of a polyline's length. */
export function along(coords: LngLatTuple[], f: number): LngLatTuple {
  const cum = cumulative(coords);
  const total = cum[cum.length - 1] || 1;
  const d = Math.min(Math.max(f, 0), 1) * total;
  const i = cum.findIndex((c) => c >= d);
  if (i <= 0) return coords[0];
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])];
}
/** Fraction along the line of the vertex nearest p. */
function fractionOf(coords: LngLatTuple[], p: LngLatTuple): number {
  const cum = cumulative(coords);
  const total = cum[cum.length - 1] || 1;
  let best = 0;
  let bestD = Infinity;
  coords.forEach((c, i) => { const d = dist(c, p); if (d < bestD) { bestD = d; best = cum[i]; } });
  // Callouts off a straight-line stub ride project by distance from the start.
  if (coords.length === 2) return Math.min(1, dist(coords[0], p) / total);
  return best / total;
}

export function buildTimeline(trip: Trip): Segment[] {
  const segs: Segment[] = [];
  for (const leg of trip.legs) {
    if (leg.kind === "drive") {
      segs.push({ kind: "drive", label: leg.label, coords: leg.coords, realS: leg.durationS, underground: false, callouts: leg.turns.map((t) => ({ f: fractionOf(leg.coords, t.at), text: t.text })) });
    } else if (leg.kind === "walk" || leg.kind === "transfer") {
      segs.push({ kind: "walk", label: leg.label, coords: leg.coords, realS: leg.durationS, underground: leg.kind === "transfer", callouts: leg.turns.map((t) => ({ f: fractionOf(leg.coords, t.at), text: t.text })) });
    } else if (leg.kind === "enter") {
      const p: LngLatTuple = [leg.portal.lon, leg.portal.lat];
      const s: LngLatTuple = [leg.station.lon, leg.station.lat];
      segs.push({ kind: "descend", label: leg.label, coords: [p, s], realS: 60, underground: true, callouts: [{ f: 0, text: leg.label }] });
    } else if (leg.kind === "ride") {
      segs.push({ kind: "ride", label: leg.label, coords: leg.coords, realS: leg.durationS, underground: leg.underground, route: leg.route, callouts: [{ f: 0, text: leg.label }, ...leg.stops.map((s) => ({ f: fractionOf(leg.coords, s.at), text: s.text }))] });
    } else {
      const p: LngLatTuple = [leg.portal.lon, leg.portal.lat];
      const s: LngLatTuple = [leg.station.lon, leg.station.lat];
      const outage = leg.portal.outage ? ` ${leg.portal.outage}` : "";
      segs.push({ kind: "ascend", label: leg.label, coords: [s, p], realS: 60, underground: true, callouts: [{ f: 0, text: `${leg.label}.${outage}` }] });
    }
  }
  return segs.filter((s) => s.coords.length >= 2);
}

/** Wall-clock seconds for a segment at a speed, kept watchable. */
export function wallSeconds(seg: Segment, speed: number): number {
  return Math.min(45, Math.max(3, seg.realS / speed));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function poseAt(seg: Segment, f: number): Pose {
  const center = along(seg.coords, f);
  const ahead = along(seg.coords, Math.min(1, f + 0.02));
  const b = dist(center, ahead) > 0.5 ? bearing(center, ahead) : bearing(seg.coords[0], seg.coords[seg.coords.length - 1]);
  switch (seg.kind) {
    case "walk": return { center, bearing: b, pitch: 75, zoom: 18.5 };
    // Car eye height (~1.2 m): MapLibre has no altitude, so max pitch + a high zoom.
    case "drive": return { center, bearing: b, pitch: 80, zoom: 19 };
    case "descend": return { center, bearing: b, pitch: lerp(75, 55, f), zoom: lerp(18.5, 16.8, f) };
    case "ascend": return { center, bearing: b, pitch: lerp(55, 75, f), zoom: lerp(16.8, 18.5, f) };
    case "ride": return { center, bearing: b, pitch: seg.underground ? 55 : 65, zoom: seg.underground ? 15.8 : 16.4 };
  }
}

/** The latest callout reached at fraction f. */
export function calloutAt(seg: Segment, f: number): string {
  let text = seg.label;
  for (const c of seg.callouts) if (c.f <= f + 1e-6) text = c.text;
  return text;
}
