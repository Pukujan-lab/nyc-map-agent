/** Pure helpers for the bus-stop sheet: pick the tapped stop and word the arrivals. */
export type StopLike = { id: string; lat: number; lon: number };

/** The stop closest to a tapped point, or undefined when none is within `maxM` metres. */
export function nearestStop<T extends StopLike>(stops: T[], lon: number, lat: number, maxM = 60): T | undefined {
  const k = Math.cos((lat * Math.PI) / 180);
  let best: T | undefined;
  let bestD = maxM;
  for (const s of stops) {
    const d = Math.hypot((s.lat - lat) * 111_320, (s.lon - lon) * 111_320 * k);
    if (d <= bestD) { best = s; bestD = d; }
  }
  return best;
}

/** "Due", "4 min" or "1 h 5 min" for an arrival at `eta` (epoch s); empty when unknown. */
export function etaText(eta: number | null, nowS: number): string {
  if (eta == null) return "";
  const m = Math.round((eta - nowS) / 60);
  if (m <= 0) return "Due";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
