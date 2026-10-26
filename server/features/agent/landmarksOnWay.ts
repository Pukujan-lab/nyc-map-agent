import { bearingTo, metresTo, turnFrom, type GuideLandmark } from "../../../src/lib/guide/landmarkGuide";
import type { LngLatTuple } from "../../../src/features/agent/schema";

/** A landmark a walker passes, and which hand it is on. */
export interface Passed { name: string; side: "left" | "right" }

const pt = ([lon, lat]: LngLatTuple) => ({ lon, lat });

/**
 * Directions by things you can see ("along 42nd St, on your left, next to the
 * library"): the guide landmarks within `withinM` of the walking line, in the
 * order you reach them, each with the side it is on. A landmark is matched to
 * the nearest point of the line, and its side comes from the line's direction there.
 */
export function landmarksOnWay(coords: readonly LngLatTuple[], list: readonly GuideLandmark[], withinM = 60, max = 3): Passed[] {
  if (coords.length < 2) return [];
  const hits: Array<Passed & { i: number }> = [];
  for (const l of list) {
    let best = Infinity, bi = -1;
    for (let i = 0; i < coords.length; i++) {
      const d = metresTo(pt(coords[i]), l);
      if (d < best) { best = d; bi = i; }
    }
    if (best > withinM) continue;
    const a = coords[Math.min(bi, coords.length - 2)], b = coords[Math.min(bi, coords.length - 2) + 1];
    const turn = turnFrom(bearingTo(pt(a), pt(b)), bearingTo(pt(a), l));
    hits.push({ name: l.name, side: turn < 0 ? "left" : "right", i: bi });
  }
  return hits.sort((x, y) => x.i - y.i).slice(0, max).map(({ name, side }) => ({ name, side }));
}

/** The landmark nearest a turn, to say "turn left at the library". */
export function landmarkAtTurn(at: LngLatTuple, list: readonly GuideLandmark[], withinM = 50): string | null {
  let best: GuideLandmark | null = null, bd = withinM;
  for (const l of list) { const d = metresTo(pt(at), l); if (d <= bd) { bd = d; best = l; } }
  return best?.name ?? null;
}
