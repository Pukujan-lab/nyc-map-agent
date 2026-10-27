import type { StaticSystem } from "./model";

/**
 * Arrow keys along a picked subway line (owner, 2026-10-27): its stations and
 * the trains running on it, in track order, so one key press goes to whichever
 * comes next: a train between two stations, otherwise the next station.
 */
export type LineStop = { kind: "station" | "train"; id: string; m: number; coord: [number, number] };
type Shape = StaticSystem["shapes"][string];

/** Metres along the shape of the point on it nearest `p`. */
export function shapeM(shape: Shape, p: [number, number]): number {
  const k = Math.cos((p[1] * Math.PI) / 180);
  let best = Infinity, m = 0;
  for (let i = 1; i < shape.c.length; i++) {
    const [ax, ay] = shape.c[i - 1], [bx, by] = shape.c[i];
    const dx = (bx - ax) * k, dy = by - ay, px = (p[0] - ax) * k, py = p[1] - ay;
    const t = Math.min(1, Math.max(0, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    const d = (px - dx * t) ** 2 + (py - dy * t) ** 2;
    if (d < best) { best = d; m = shape.m[i - 1] + (shape.m[i] - shape.m[i - 1]) * t; }
  }
  return m;
}

/** The point `m` metres along the shape. */
export function pointAt(shape: Shape, m: number): [number, number] {
  const i = shape.m.findIndex((v) => v >= m);
  if (i <= 0) return shape.c[i === 0 ? 0 : shape.c.length - 1];
  const t = (m - shape.m[i - 1]) / Math.max(1, shape.m[i] - shape.m[i - 1]);
  return [shape.c[i - 1][0] + (shape.c[i][0] - shape.c[i - 1][0]) * t, shape.c[i - 1][1] + (shape.c[i][1] - shape.c[i - 1][1]) * t];
}

/** The line's stations and trains, ordered along its track. */
export function lineStops(sys: StaticSystem, route: string, trains: Array<{ key: string; lon: number; lat: number }>): LineStop[] {
  const shape = sys.shapes[route], sm = sys.stopM[route];
  if (!shape || !sm) return [];
  const stops: LineStop[] = [];
  for (const f of sys.stations.features) {
    const m = sm[f.properties.id];
    if (m !== undefined) stops.push({ kind: "station", id: f.properties.id, m, coord: f.geometry.coordinates as [number, number] });
  }
  for (const t of trains) stops.push({ kind: "train", id: t.key, m: shapeM(shape, [t.lon, t.lat]), coord: [t.lon, t.lat] });
  // A train standing at a station comes just after it, so stepping never skips either.
  return stops.sort((a, z) => a.m - z.m || (a.kind === z.kind ? a.id.localeCompare(z.id) : a.kind === "station" ? -1 : 1));
}

/** The stop one step from `at` (a stop id, or a place `m` metres along when nothing is focused yet). */
export function stepAlong(stops: LineStop[], at: { id?: string | null; m: number }, dir: 1 | -1): LineStop | null {
  const i = at.id ? stops.findIndex((s) => s.id === at.id) : -1;
  if (i >= 0) return stops[i + dir] ?? null;
  // Not on the line yet: the first stop past the place, in that direction.
  return dir > 0 ? stops.find((s) => s.m > at.m) ?? null : [...stops].reverse().find((s) => s.m < at.m) ?? null;
}

/** The next (or previous) other line serving a station, in its own order; null when it has just the one. */
export function otherLine(sys: StaticSystem, station: string, route: string, dir: 1 | -1): string | null {
  const f = sys.stations.features.find((s) => s.properties.id === station);
  const routes = (f?.properties.routes ?? "").split(" ").filter((r) => r && sys.stopM[r]?.[station] !== undefined);
  if (routes.length < 2) return null;
  const i = routes.indexOf(route);
  return routes[(Math.max(0, i) + dir + routes.length) % routes.length];
}
