import type { Leg } from "./schema";

type Pos = [number, number];
export interface LegFocus { bounds: [Pos, Pos]; marks: Array<{ at: Pos; name: string }> }

/**
 * What tapping one step of a trip shows on the map: the stretch to frame and
 * the points to mark ("Board at …", "Get off at …"), so a step is a place,
 * not a line of text. Pure, for tests.
 */
export function legFocus(l: Leg): LegFocus | null {
  let pts: Pos[] = [];
  const marks: LegFocus["marks"] = [];
  if (l.kind === "enter" || l.kind === "exit") {
    const at: Pos = [l.station.lon, l.station.lat];
    pts = [at];
    marks.push({ at, name: l.kind === "enter" ? `Enter ${l.station.name}` : `Exit ${l.station.name}` });
  } else {
    pts = l.coords as Pos[];
    const first = pts[0], last = pts[pts.length - 1];
    if (l.kind === "ride") {
      marks.push({ at: first, name: `Board at ${l.fromStop ?? "the first stop"}` }, { at: last, name: `Get off at ${l.toStop ?? "your stop"}` });
    } else {
      marks.push({ at: last, name: l.label });
    }
  }
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { bounds: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], marks };
}
