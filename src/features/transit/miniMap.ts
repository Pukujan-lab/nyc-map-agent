/**
 * Heading-up mini map arithmetic, pure so it is testable without a canvas.
 * Ground metres around the walker are rotated so the way they face points up
 * the disc, then scaled to pixels; `unproject` turns a tap back into a place.
 */
const M_PER_DEG = 111_320;

export type MiniView = { lon: number; lat: number; bearing: number; radiusM: number; radiusPx: number };

/** Pixel offset from the disc centre (x right, y down) for a place, heading-up. */
export function project(v: MiniView, lon: number, lat: number): { x: number; y: number; d: number } {
  const east = (lon - v.lon) * M_PER_DEG * Math.cos((v.lat * Math.PI) / 180);
  const north = (lat - v.lat) * M_PER_DEG;
  const b = (v.bearing * Math.PI) / 180;
  const right = east * Math.cos(b) - north * Math.sin(b);
  const ahead = east * Math.sin(b) + north * Math.cos(b);
  const k = v.radiusPx / v.radiusM;
  return { x: right * k, y: -ahead * k, d: Math.hypot(east, north) };
}

/** The place under a pixel offset from the disc centre. */
export function unproject(v: MiniView, x: number, y: number): { lon: number; lat: number } {
  const k = v.radiusM / v.radiusPx;
  const right = x * k, ahead = -y * k;
  const b = (v.bearing * Math.PI) / 180;
  const east = right * Math.cos(b) + ahead * Math.sin(b);
  const north = -right * Math.sin(b) + ahead * Math.cos(b);
  return { lon: v.lon + east / (M_PER_DEG * Math.cos((v.lat * Math.PI) / 180)), lat: v.lat + north / M_PER_DEG };
}

/** Where on the rim north sits: an angle in radians clockwise from "up". */
export const northAngle = (bearing: number) => (-bearing * Math.PI) / 180;
