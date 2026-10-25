import type { NtaIndex } from "@/lib/geo/ntaIndex";
import { guideLandmarks, metresTo } from "@/lib/guide/landmarkGuide";

/**
 * "MANHATTAN" for a point, in the spelling the street mart uses. The
 * neighbourhood outlines answer exactly when they are loaded; otherwise the
 * nearest guide landmark's borough is close enough away from the rivers, and
 * null means the server lists every borough and the caller picks.
 */
export function boroughAt(lat: number, lon: number, nta: NtaIndex | null): string | null {
  const i = nta ? nta.assignIndex(lat, lon) : -1;
  if (nta && i >= 0) return nta.boundaries[i].borough.toUpperCase();
  let best: { borough: string; d: number } | null = null;
  for (const l of guideLandmarks()) {
    const d = metresTo({ lon, lat }, l);
    if (!best || d < best.d) best = { borough: l.borough, d };
  }
  return best && best.d < 3000 ? best.borough.toUpperCase() : null;
}
