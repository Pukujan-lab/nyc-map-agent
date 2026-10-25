/**
 * Station exits for the underground helper: which entrances belong to a
 * station, which is closest to where you are going, how to say it so it can be
 * followed from the signs, and which way to face once you are up. Pure, for
 * tests. Distances are straight lines, not walking routes. Nothing here
 * tracks or estimates where you are underground.
 */
import { bearing, cornerOf, metres, type ExitPlace, type LandmarkCandidate, type Pt } from "@/lib/map/mapRead";
export { bearing, cornerOf, metres, type ExitPlace, type LandmarkCandidate, type Pt };

/** The slice of public/transit/subway.json this needs. */
export interface SubwayStatic {
  stations: { features: Array<{ geometry: { coordinates: number[] }; properties: { id: string; name: string } }> };
  entrances?: { features: Array<{ geometry: { coordinates: number[] }; properties: { id: string; name: string; kind: string } }> };
}

export interface Station {
  id: string;
  name: string;
  at: Pt;
}



export interface Exit extends ExitPlace {
  at: Pt;
  /** MTA entrance type: "Stair", "Elevator", "Escalator"… */
  kind: string;
  /** Compass side of the station; only for ordering and the map, never said underground. */
  side: string;
  /** Straight-line metres to the destination, when there is one. */
  toDestM: number | null;
  /** Front or back of the arriving train, when the ride's line tells it reliably. */
  trainEnd: "front" | "back" | null;
  /** Metres along the platform from the station point, + toward the front (approximate). */
  alongM: number | null;
}

const NO_PLACE: ExitPlace = { streets: null, corner: null, landmarks: [] };



const OCTANTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function octant(a: Pt, b: Pt): string {
  return OCTANTS[Math.round(bearing(a, b) / 45) % 8];
}


/** Nearest station within `maxM` metres, or null. */
export function nearestStation(sys: SubwayStatic, at: Pt, maxM = 350): (Station & { d: number }) | null {
  let best: (Station & { d: number }) | null = null;
  for (const f of sys.stations.features) {
    const p = f.geometry.coordinates as Pt;
    const d = metres(at, p);
    if (d <= maxM && (!best || d < best.d)) best = { id: String(f.properties.id), name: f.properties.name, at: [p[0], p[1]], d };
  }
  return best;
}

/**
 * The station's street entrances. The MTA list is keyed by GTFS stop id; a
 * complex (Times Sq, Fulton St) spreads one station over several ids, so
 * entrances of a same-named stop within 300 m count too. Passages between
 * buildings are not exits to the street and are left out.
 */
export function stationEntrances(sys: SubwayStatic, st: Station): Array<{ at: Pt; kind: string }> {
  const out: Array<{ at: Pt; kind: string }> = [];
  const seen = new Set<string>();
  for (const f of sys.entrances?.features ?? []) {
    const p = f.properties;
    const at = f.geometry.coordinates as Pt;
    const mine = String(p.id) === st.id || (p.name === st.name && metres(at, st.at) <= 300);
    if (!mine || /passage|easement/i.test(p.kind)) continue;
    const key = `${at[0].toFixed(5)},${at[1].toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ at: [at[0], at[1]], kind: p.kind || "Stair" });
  }
  return out;
}

/**
 * Exits ordered closest-to-destination first (straight line). Without a
 * destination they keep a stable compass order and none is called closest.
 */
export function rankExits(
  st: Station,
  ents: Array<{ at: Pt; kind: string }>,
  dest: Pt | null,
  placeAt: (at: Pt) => ExitPlace = () => NO_PLACE,
  trainAt: (at: Pt) => Pick<Exit, "trainEnd" | "alongM"> = () => ({ trainEnd: null, alongM: null }),
): Exit[] {
  const exits: Exit[] = ents.map((e) => ({
    at: e.at,
    kind: e.kind,
    side: octant(st.at, e.at),
    ...placeAt(e.at),
    toDestM: dest ? Math.round(metres(e.at, dest)) : null,
    ...trainAt(e.at),
  }));
  if (dest) return exits.sort((a, b) => (a.toDestM ?? 0) - (b.toDestM ?? 0));
  return exits.sort((a, b) => OCTANTS.indexOf(a.side) - OCTANTS.indexOf(b.side) || a.at[0] - b.at[0]);
}

/** "stairs", "elevator", "escalator": what the exit is, from the MTA type. */
export function exitKind(kind: string): string {
  return /elevator/i.test(kind) ? "elevator" : /escalator/i.test(kind) ? "escalator" : "stairs";
}

/**
 * Heading from walking, once GPS is back above ground: the bearing from the
 * first good fix to the first one at least `minM` metres away. Fixes worse
 * than `maxAccuracyM` are skipped. Null until there is enough movement.
 */
export function headingFromMovement(fixes: Array<{ at: Pt; accuracy: number | null }>, minM = 12, maxAccuracyM = 25): number | null {
  const good = fixes.filter((f) => f.accuracy === null || f.accuracy <= maxAccuracyM);
  if (good.length < 2) return null;
  const start = good[0].at;
  for (let i = 1; i < good.length; i++) if (metres(start, good[i].at) >= minM) return bearing(start, good[i].at);
  return null;
}

/** Signed smallest turn from heading a to b, -180..180. */
export function angleDiff(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/** The compass is a last resort: believe it only when it agrees with a heading we already trust. */
export function compassAgrees(compass: number | null, trusted: number | null, toleranceDeg = 35): boolean {
  return compass !== null && trusted !== null && Math.abs(angleDiff(compass, trusted)) <= toleranceDeg;
}

/** "Turn about 40° to your right": the turn from a heading to a target bearing. */
export function turnHint(heading: number, target: number): string {
  const d = Math.round(angleDiff(heading, target));
  if (Math.abs(d) <= 20) return "You are heading the right way";
  if (Math.abs(d) >= 160) return "You are heading away from it: turn around";
  return `Turn about ${Math.abs(d)}° to your ${d > 0 ? "right" : "left"}`;
}

/** "just now", "12 min ago", "3 h ago": how old the saved copy is. */
export function ageLabel(savedAt: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - savedAt) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
