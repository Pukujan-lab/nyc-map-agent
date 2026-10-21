import { z } from "zod";
import { OSRM_FOOT_URL, type LngLat } from "@/lib/api/routing";
import { metresBetween } from "@/lib/api/mapillary";

/**
 * Turn-by-turn steps for the walking route the Directions card already shows.
 * Same router (FOSSGIS OSRM foot profile, `src/lib/api/routing.ts`), same A→B,
 * just with `steps=true` so each maneuver comes back with its street name.
 */
export interface RouteStep {
  /** OSRM maneuver type: depart, turn, continue, new name, arrive, … */
  type: string;
  /** left, slight left, straight, right, uturn, … */
  modifier: string | null;
  /** Street walked on after this maneuver. */
  name: string;
  /** Where the maneuver happens, [lon, lat]. */
  location: [number, number];
  /** Heading (degrees) leaving the maneuver. */
  bearingAfter: number;
  /** Metres from this maneuver to the next. */
  distance: number;
}

export interface GuidedRoute {
  coordinates: Array<[number, number]>;
  steps: RouteStep[];
}

const stepSchema = z.object({
  distance: z.number(),
  name: z.string().default(""),
  maneuver: z.object({
    type: z.string(),
    modifier: z.string().optional(),
    location: z.tuple([z.number(), z.number()]),
    bearing_after: z.number().default(0),
  }),
});

const responseSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }),
        legs: z.array(z.object({ steps: z.array(stepSchema) })),
      }),
    )
    .optional(),
});

export function stepsUrl(a: LngLat, b: LngLat): string {
  const coords = `${a.lon.toFixed(6)},${a.lat.toFixed(6)};${b.lon.toFixed(6)},${b.lat.toFixed(6)}`;
  return `${OSRM_FOOT_URL}/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=true`;
}

export function parseGuidedRoute(json: unknown): GuidedRoute | null {
  const parsed = responseSchema.safeParse(json);
  const route = parsed.success && parsed.data.code === "Ok" ? parsed.data.routes?.[0] : undefined;
  if (!route) return null;
  return {
    coordinates: route.geometry.coordinates,
    steps: route.legs.flatMap((leg) =>
      leg.steps.map((s) => ({
        type: s.maneuver.type,
        modifier: s.maneuver.modifier ?? null,
        name: s.name,
        location: s.maneuver.location,
        bearingAfter: s.maneuver.bearing_after,
        distance: s.distance,
      })),
    ),
  };
}

/** Coordinates only, never logged or sent anywhere but the router the app already uses. */
export async function fetchGuidedRoute(a: LngLat, b: LngLat, signal?: AbortSignal): Promise<GuidedRoute | null> {
  const response = await fetch(stepsUrl(a, b), { signal });
  if (!response.ok) return null;
  return parseGuidedRoute(await response.json());
}

/** "Turn left on W 42 St" — plain words from an OSRM maneuver. */
export function instructionFor(step: RouteStep): string {
  const on = step.name ? ` on ${step.name}` : "";
  const mod = step.modifier ?? "straight";
  switch (step.type) {
    case "arrive":
      return "Arrive at your destination";
    case "depart":
      return `Head out${on}`;
    case "roundabout":
    case "rotary":
      return `Take the roundabout${on}`;
    default:
      if (mod === "uturn") return `Turn around${on}`;
      if (mod === "straight") return `Continue straight${on}`;
      return `Turn ${mod}${on}`;
  }
}

export function formatMetres(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.max(0, Math.round(m / 10) * 10)} m`;
}

const toPoint = (c: [number, number]) => ({ lon: c[0], lat: c[1] });

/** Metres along the polyline of the point on it closest to `p`. */
export function distanceAlong(coords: Array<[number, number]>, p: LngLat): number {
  let best = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  let walked = 0;
  const cosLat = Math.cos((p.lat * Math.PI) / 180);
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];
    const ax = (a[0] - p.lon) * cosLat;
    const ay = a[1] - p.lat;
    const dx = (b[0] - a[0]) * cosLat;
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    const seg = metresBetween(toPoint(a), toPoint(b));
    if (d < best) {
      best = d;
      bestAlong = walked + t * seg;
    }
    walked += seg;
  }
  return bestAlong;
}

export interface Progress {
  /** The maneuver you are walking toward. */
  next: RouteStep;
  nextIndex: number;
  /** Metres left until it. */
  metresToNext: number;
  instruction: string;
}

/** Which maneuver comes next from `p`, and how far it is. */
export function progressAt(route: GuidedRoute, p: LngLat): Progress | null {
  if (route.steps.length < 2) return null;
  const along = distanceAlong(route.coordinates, p);
  let start = 0;
  for (let i = 0; i < route.steps.length - 1; i += 1) {
    const end = start + route.steps[i].distance;
    // Within 5 m of a maneuver counts as reached: move on to the one after.
    if (along < end - 5 || i === route.steps.length - 2) {
      const next = route.steps[i + 1];
      return { next, nextIndex: i + 1, metresToNext: Math.max(0, end - along), instruction: instructionFor(next) };
    }
    start = end;
  }
  return null;
}

/** The route cut at `along` metres: [walked part, part still ahead]. */
export function splitAt(
  coords: Array<[number, number]>,
  along: number,
): [Array<[number, number]>, Array<[number, number]>] {
  let walked = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];
    const seg = metresBetween(toPoint(a), toPoint(b));
    if (walked + seg >= along) {
      const t = seg > 0 ? (along - walked) / seg : 0;
      const cut: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return [[...coords.slice(0, i), cut], [cut, ...coords.slice(i)]];
    }
    walked += seg;
  }
  return [coords, coords.slice(-1)];
}

/** Metres from `p` to the end of the route. */
export function metresLeft(route: GuidedRoute, p: LngLat): number {
  const total = route.steps.reduce((s, x) => s + x.distance, 0);
  return Math.max(0, total - distanceAlong(route.coordinates, p));
}
