/**
 * Per-source vs "Average" views. The average is a composite index: each
 * selected source is normalized per area to a percentile rank (0–100, ties
 * share their mean rank, areas with no records rank at the bottom), then the
 * ranks are averaged. Percentiles rather than raw counts or z-scores, because
 * the sources have wildly different scales and long right tails — 300 311
 * calls and 3 speed humps should weigh the same.
 */

/** Percentile rank (0–100) of every key; missing keys count as zero. */
export function percentileRanks(
  values: Record<string, number>,
  keys: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const n = keys.length;
  if (n === 0) return out;
  if (n === 1) {
    out[keys[0]] = (values[keys[0]] ?? 0) > 0 ? 100 : 0;
    return out;
  }
  const sorted = keys
    .map((key) => ({ key, value: values[key] ?? 0 }))
    .sort((a, b) => a.value - b.value);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1].value === sorted[i].value) j += 1;
    // Mean rank of the tie group, scaled so the lowest is 0 and highest 100.
    const rank = ((i + j) / 2 / (n - 1)) * 100;
    for (let k = i; k <= j; k += 1) {
      out[sorted[k].key] = sorted[k].value > 0 ? rank : 0;
    }
    i = j + 1;
  }
  return out;
}

export interface CompositeEntry {
  /** Mean percentile across the contributing sources, 0–100. */
  score: number;
  /** Per-source raw value and percentile, in the order sources were given. */
  parts: Array<{
    sourceId: string;
    value: number;
    /** Raw percentile of the value among areas. */
    percentile: number;
    /** True when "higher is better", so the concern is 100 − percentile. */
    inverted: boolean;
    /** What this source adds to the average (0–100, higher = more concern). */
    concern: number;
  }>;
}

export function averageComposite(
  perSource: Record<string, Record<string, number>>,
  sourceIds: string[],
  keys: string[],
  /** Sources where higher is better; their concern is 100 − percentile. */
  inverted: readonly string[] = [],
): Record<string, CompositeEntry> {
  const ranks = sourceIds.map((id) => percentileRanks(perSource[id] ?? {}, keys));
  const out: Record<string, CompositeEntry> = {};
  for (const key of keys) {
    const parts = sourceIds.map((sourceId, index) => {
      const percentile = ranks[index][key] ?? 0;
      const isInverted = inverted.includes(sourceId);
      return {
        sourceId,
        value: perSource[sourceId]?.[key] ?? 0,
        percentile,
        inverted: isInverted,
        concern: isInverted ? 100 - percentile : percentile,
      };
    });
    const score =
      parts.length > 0
        ? parts.reduce((sum, part) => sum + part.concern, 0) / parts.length
        : 0;
    out[key] = { score: Math.round(score * 10) / 10, parts };
  }
  return out;
}
