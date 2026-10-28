/**
 * Coming up from the subway is when people are most lost about which way they
 * face. The moment GPS comes back sharp beside a stair after a spell of weak
 * fixes below ground, that stair's way up is the way you face. Pure, for tests;
 * the stairs come from the app's own subway file.
 */
type Pt = [number, number];

export interface Stair {
  at: Pt;
  /** Degrees from north you face when climbing it. */
  up: number;
}

export interface Fix {
  t: number;
  at: Pt;
  accuracy: number | null;
}

/** Below ground: GPS this vague (metres). */
export const WEAK_M = 60;
/** Back up: GPS this sharp. */
export const SHARP_M = 25;
/** The sharp fix must be this close to the stair. */
export const STAIR_M = 30;
/** Weak fixes within this long before count as having been below ground. */
const BELOW_WINDOW_MS = 120_000;

function metres(a: Pt, b: Pt): number {
  const kx = 111_320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111_320);
}

function bearing(a: Pt, b: Pt): number {
  const kx = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return ((Math.atan2((b[0] - a[0]) * kx, b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}

/** The way you face if the latest fix is you just coming up a stair, else null. */
export function surfacedFacing(fixes: Fix[], stairs: Stair[]): number | null {
  const last = fixes.at(-1);
  if (!last || last.accuracy === null || last.accuracy > SHARP_M) return null;
  const prev = fixes.at(-2);
  // Only the first sharp fix after the weak ones: later fixes are ordinary walking.
  if (prev && prev.accuracy !== null && prev.accuracy <= SHARP_M) return null;
  const weak = fixes.filter((f) => last.t - f.t <= BELOW_WINDOW_MS && (f.accuracy ?? 0) >= WEAK_M);
  if (weak.length < 3) return null;
  let best: { d: number; up: number } | null = null;
  for (const s of stairs) {
    const d = metres(last.at, s.at);
    if (d <= STAIR_M && (!best || d < best.d)) best = { d, up: s.up };
  }
  return best ? Math.round(best.up) % 360 : null;
}

interface SubwayFile {
  stations: { features: Array<{ properties: { id: string | number }; geometry: { coordinates: number[] } }> };
  entrances?: { features: Array<{ properties: { id: string | number; kind: string; up?: number }; geometry: { coordinates: number[] } }> };
}

/**
 * Stairs with the way up: mapped steps give it exactly (`up`); otherwise
 * climbing out leads away from the station, which is close enough for a first guess.
 */
export function stairsFrom(file: SubwayFile): Stair[] {
  const centre = new Map(file.stations.features.map((f) => [String(f.properties.id), f.geometry.coordinates as Pt]));
  const out: Stair[] = [];
  for (const e of file.entrances?.features ?? []) {
    if (/passage/i.test(e.properties.kind)) continue;
    const at = e.geometry.coordinates as Pt;
    const st = centre.get(String(e.properties.id));
    const up = typeof e.properties.up === "number" ? e.properties.up : st ? bearing(st, at) : null;
    if (up !== null) out.push({ at, up });
  }
  return out;
}

let stairs: Promise<Stair[]> | null = null;

/** The city's stairs, fetched once and only when someone has been below ground. */
export function loadStairs(): Promise<Stair[]> {
  stairs ??= fetch("/transit/subway.json")
    .then((r) => r.json() as Promise<SubwayFile>)
    .then(stairsFrom)
    .catch(() => {
      stairs = null;
      return [];
    });
  return stairs;
}
