import type { NamedLine } from "@/lib/map/streetPos";

type Pt = [number, number];

/**
 * Which way a subway stair runs. NYC stairs almost always run along the curb,
 * parallel to the sidewalk (owner, 2026-10-27), so pointing them at the
 * station's centre turned most of them sideways. OpenStreetMap's mapped steps
 * give the real way up (`up`, baked into subway.json); without it the stair
 * lies along the nearest street, going down toward the station's side.
 */

function bearing(a: Pt, b: Pt): number {
  const kx = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return ((Math.atan2((b[0] - a[0]) * kx, b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}

function toXY(p: Pt, lat0: number): [number, number] {
  return [p[0] * 111_320 * Math.cos((lat0 * Math.PI) / 180), p[1] * 111_320];
}

/** Bearing (0–179) of the street segment nearest `at`, within `maxM` metres; null when none is that close. */
export function curbAxis(lines: NamedLine[], at: Pt, maxM = 35): number | null {
  const [px, py] = toXY(at, at[1]);
  let best: { d: number; b: number } | null = null;
  for (const l of lines) {
    for (let i = 1; i < l.coords.length; i++) {
      const [ax, ay] = toXY(l.coords[i - 1], at[1]), [bx, by] = toXY(l.coords[i], at[1]);
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      if (!len2) continue;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d <= maxM && (!best || d < best.d)) best = { d, b: bearing(l.coords[i - 1], l.coords[i]) % 180 };
    }
  }
  return best?.b ?? null;
}

const diff = (a: number, b: number) => Math.abs(((((b - a) % 360) + 540) % 360) - 180);

/** The bearing a stair goes down: mapped steps first, else along the curb toward the station, else at the station. */
export function stairDescent(at: Pt, station: Pt | null, up: number | undefined, lines: NamedLine[]): number {
  if (typeof up === "number") return (up + 180) % 360;
  const toward = station ? bearing(at, station) : 0;
  const axis = lines.length ? curbAxis(lines, at) : null;
  if (axis === null) return toward;
  return diff(axis, toward) <= diff(axis + 180, toward) ? axis : axis + 180;
}

/** Compass words for a heading: "north", "northeast"… */
export function compassWord(deg: number): string {
  return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
