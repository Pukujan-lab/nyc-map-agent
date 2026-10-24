import type { GuideCategory, GuideLandmark, GuideLandmarkFile } from "./landmarkTypes";

export type { GuideBorough, GuideCategory, GuideLandmark, GuidePicture } from "./landmarkTypes";

/**
 * Landmarks that tell you where you are (#361 goal 3): well-known places you
 * can see from the street across all five boroughs, generated from Wikidata
 * (CC0) by scripts/build-landmark-guide.ts. Pictures are Wikimedia Commons
 * files with their own licence and author stored beside them.
 *
 * Shared by the map layer (src/lib/map/landmarkLabels.ts), the walking
 * header, and anything that needs "which landmark is where": the agent and the
 * underground surfacing check can call pickGuideLandmarks directly.
 *
 * The list is its own chunk, kept out of the app entry: the first call to
 * loadGuideLandmarks (or to guideLandmarks / pickGuideLandmarks) fetches it
 * once; until then those return [].
 */
let loaded: readonly GuideLandmark[] | null = null;
let loading: Promise<readonly GuideLandmark[]> | null = null;

/** Fetches the list once; later calls share the same promise. */
export function loadGuideLandmarks(): Promise<readonly GuideLandmark[]> {
  loading ??= import("./landmarks.json")
    .then((m) => {
      loaded = (m.default as GuideLandmarkFile).landmarks;
      return loaded;
    })
    .catch((err: unknown) => {
      // A failed chunk load may succeed on the next call.
      loading = null;
      throw err;
    });
  return loading;
}

/** The list if it has arrived, else [] (and the load starts). */
export function guideLandmarks(): readonly GuideLandmark[] {
  if (!loaded) void loadGuideLandmarks().catch(() => {});
  return loaded ?? [];
}

/** Zoom from which each tier is drawn: a few citywide, more as you zoom in. */
export const TIER_MIN_ZOOM: Record<GuideLandmark["tier"], number> = { 1: 9, 2: 12, 3: 14 };

/** The landmarks drawn at `zoom`, same rule as the map layer's per-feature filter. */
export function landmarksAtZoom(zoom: number, list: readonly GuideLandmark[] = guideLandmarks()): GuideLandmark[] {
  return list.filter((l) => zoom >= TIER_MIN_ZOOM[l.tier]);
}

/** Tall or long things show over the rooftops from far away; a museum front only from its block. */
const FAR_SEEN: ReadonlySet<GuideCategory> = new Set(["tower", "bridge"]);

/** How far away a landmark is still useful to name, in metres. */
export function sightRangeM(l: Pick<GuideLandmark, "category" | "tier">): number {
  if (FAR_SEEN.has(l.category)) return l.tier === 1 ? 4000 : l.tier === 2 ? 2500 : 1200;
  return l.tier === 1 ? 1500 : l.tier === 2 ? 800 : 450;
}

export interface LonLat {
  lon: number;
  lat: number;
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** Metres between two points; equirectangular, plenty at city scale. */
export function metresTo(a: LonLat, b: LonLat): number {
  const kx = 111_320 * Math.cos(toRad((a.lat + b.lat) / 2));
  return Math.hypot((b.lon - a.lon) * kx, (b.lat - a.lat) * 111_320);
}

/** Compass bearing from a to b, 0 = north, clockwise, 0..360. */
export function bearingTo(a: LonLat, b: LonLat): number {
  const kx = Math.cos(toRad((a.lat + b.lat) / 2));
  const deg = (Math.atan2((b.lon - a.lon) * kx, b.lat - a.lat) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Signed turn from `heading` to `bearing`, -180..180, negative = to the left. */
export function turnFrom(heading: number, bearing: number): number {
  return ((((bearing - heading) % 360) + 540) % 360) - 180;
}

/** "ahead", "ahead, slightly left", "to your right", "behind you, on the left", "behind you". */
export function relativeDirection(turn: number): string {
  const a = Math.abs(turn);
  const side = turn < 0 ? "left" : "right";
  if (a <= 15) return "ahead";
  if (a <= 45) return `ahead, slightly ${side}`;
  if (a <= 115) return `to your ${side}`;
  if (a <= 160) return `behind you, on the ${side}`;
  return "behind you";
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** "to the north-east": used when the heading is unknown (just surfaced, compass not settled). */
export function compassDirection(bearing: number): string {
  return `to the ${COMPASS[Math.round(bearing / 45) % 8]}`;
}

export interface GuidePick {
  landmark: GuideLandmark;
  distanceM: number;
  /** Compass bearing from the point to the landmark. */
  bearing: number;
  /** Signed turn from the heading, or null when no heading was given. */
  turn: number | null;
  /** "ahead, slightly left" or, without a heading, "to the north-east". */
  direction: string;
  /** "Empire State Building ahead, slightly left". */
  text: string;
}

export interface PickOptions {
  /** At most this many (default 2). */
  max?: number;
  list?: readonly GuideLandmark[];
  /** Ignore anything farther than this, whatever its sight range (street level: STREET_LEVEL_RANGE_M). */
  maxDistanceM?: number;
}

/** At street level only landmarks this close are drawn or named; JFK is not on a Midtown horizon. */
export const STREET_LEVEL_RANGE_M = 1500;

/** Landmarks within `radiusM` of `at` (the street-level map shows only these). */
export function landmarksNear(at: LonLat, radiusM: number, list: readonly GuideLandmark[] = guideLandmarks()): GuideLandmark[] {
  return list.filter((l) => metresTo(at, l) <= radiusM);
}

/** What you face is easier to find than what is behind you. */
function facingWeight(turn: number | null): number {
  if (turn === null) return 1;
  const a = Math.abs(turn);
  return a <= 45 ? 1 : a <= 115 ? 0.7 : 0.35;
}

/**
 * The 1-2 most useful landmarks you can see from `at` facing `heading`
 * (degrees from north; null when unknown). Only landmarks within their sight
 * range count. Score: how well known, how close relative to that range, and
 * how near your line of sight. The second pick must lie in a clearly
 * different direction, so two names triangulate instead of repeating.
 * No map, no DOM. Before the list has loaded this returns [] and starts the
 * load; await loadGuideLandmarks() first when the answer must not be empty.
 */
export function pickGuideLandmarks(at: LonLat, heading: number | null, opts: PickOptions = {}): GuidePick[] {
  const max = opts.max ?? 2;
  const scored: Array<{ pick: GuidePick; score: number }> = [];
  for (const l of opts.list ?? guideLandmarks()) {
    const distanceM = metresTo(at, l);
    const range = sightRangeM(l);
    if (distanceM > range || distanceM > (opts.maxDistanceM ?? Infinity)) continue;
    const bearing = bearingTo(at, l);
    const turn = heading === null || !Number.isFinite(heading) ? null : turnFrom(heading, bearing);
    // Standing on it: still worth naming, so no zero-distance blow-up.
    const nearness = 1 - (distanceM / range) * 0.7;
    const fame = Math.log2(1 + l.sitelinks);
    const score = fame * nearness * facingWeight(turn);
    const direction = distanceM < 40 ? "here" : turn === null ? compassDirection(bearing) : relativeDirection(turn);
    const text = direction === "here" ? `You are at ${l.name}` : `${l.name} ${direction}`;
    scored.push({ pick: { landmark: l, distanceM: Math.round(distanceM), bearing: Math.round(bearing), turn: turn === null ? null : Math.round(turn), direction, text }, score });
  }
  scored.sort((a, b) => b.score - a.score || a.pick.distanceM - b.pick.distanceM);
  const picks: GuidePick[] = [];
  for (const { pick } of scored) {
    if (picks.length >= max) break;
    if (picks.some((p) => Math.abs(turnFrom(p.bearing, pick.bearing)) < 35)) continue;
    picks.push(pick);
  }
  return picks;
}

/** One line for a header or a spoken hint: "Empire State Building ahead; Flatiron Building to your left". */
export function describeGuide(picks: readonly GuidePick[]): string {
  return picks.map((p) => p.text).join("; ");
}
