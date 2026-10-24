/**
 * Station complexes arrive as several features with the same name a few metres
 * apart (one per line or platform). Each would draw its own label, so the
 * name stacks twice. This keeps one label per name per cluster (#312).
 */
const CLUSTER_M = 250;

interface Pt { id: string; name: string; lon: number; lat: number }

function metres(a: Pt, b: Pt): number {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

const keyOf = (s: Pt) => s.name.trim().toLowerCase();

/** Ids that should draw their name: the first of each same-name group within CLUSTER_M. */
export function labelledStationIds(stations: readonly Pt[]): Set<string> {
  const kept: Pt[] = [];
  for (const s of stations) {
    if (!keyOf(s)) continue;
    if (kept.some((k) => keyOf(k) === keyOf(s) && metres(k, s) < CLUSTER_M)) continue;
    kept.push(s);
  }
  return new Set(kept.map((k) => k.id));
}
