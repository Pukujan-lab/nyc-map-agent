/**
 * Blends historical segment travel times (median by route, direction and hour
 * of week, from /api/transit-segments) with live GTFS-rt arrival times.
 * Near-term legs trust the live ETA more; far legs, where feeds often carry
 * plain schedule times, lean on history. With no history, live/schedule
 * times are used unchanged. The next stop's live ETA is never moved, so the
 * monotonic hold and the displayed ETA stay tied to the feed.
 */
export type SegmentRow = { dir: number; from: string; to: string; kind: "travel" | "dwell"; n: number; median: number; p80: number };
/** Median travel seconds from one stop to the next, if known. */
export type SegmentLookup = (route: string, dir: number | null, from: string, to: string) => number | undefined;

/** Weight of the live ETA for a leg starting `lead` seconds from now. */
export const liveWeight = (lead: number) => Math.min(0.9, Math.max(0.4, 0.9 - (lead / 1200) * 0.5));

export function blendStops<S extends { id: string; arr: number; dep?: number }>(
  stops: S[], now: number, route: string, dir: number | null, hist?: SegmentLookup,
): S[] {
  if (!hist || stops.length < 2) return stops;
  const out = stops.map((s) => ({ ...s }));
  for (let i = 1; i < out.length; i++) {
    const a = stops[i - 1], b = stops[i];
    const median = hist(route, dir, a.id, b.id);
    const shift = out[i - 1].arr - a.arr;
    if (median === undefined || !(median > 0)) {
      out[i].arr = b.arr + shift;
      if (b.dep !== undefined) out[i].dep = b.dep + shift;
      continue;
    }
    const leave = a.dep ?? a.arr;
    const live = b.arr - leave;
    const w = liveWeight(Math.max(0, leave - now));
    const travel = w * live + (1 - w) * median;
    const leaveOut = out[i - 1].dep ?? out[i - 1].arr;
    out[i].arr = Math.max(out[i - 1].arr, leaveOut + travel);
    if (b.dep !== undefined) out[i].dep = out[i].arr + (b.dep - b.arr);
  }
  return out;
}

/** Lookup over rows from /api/transit-segments, keyed by route. */
export function lookupFrom(byRoute: Map<string, SegmentRow[]>): SegmentLookup {
  const idx = new Map<string, number>();
  for (const [route, rows] of byRoute) for (const r of rows) if (r.kind === "travel") idx.set(`${route}|${r.dir}|${r.from}|${r.to}`, r.median);
  return (route, dir, from, to) => idx.get(`${route}|${dir ?? -1}|${from}|${to}`) ?? idx.get(`${route}|-1|${from}|${to}`);
}
