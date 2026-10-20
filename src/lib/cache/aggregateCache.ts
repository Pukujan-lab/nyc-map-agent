import type { AggregateResult, DatasetId } from "@/lib/geo/types";
import type { WindowId } from "@/lib/windows";

/**
 * Bumped to 2 when blocks were added to the result shape, and to 3 when the
 * per-address rollups (`topAddresses`, `topStreets`, block `addresses`) were
 * added — an old cache would render a map with no house numbers on it.
 */
const VERSION = 3;

function cacheKey(dataset: DatasetId, windowId: WindowId): string {
  return `nycma:aggregate:v${VERSION}:${dataset}:${windowId}`;
}

/**
 * Only the aggregate is cached — never the raw rows. A neighborhood rollup is
 * ~262 rows of small numbers, so a repeat visit is instant.
 */
export function readCachedAggregate(
  dataset: DatasetId,
  windowId: WindowId,
): AggregateResult | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(dataset, windowId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AggregateResult;
    if (parsed.dataset !== dataset || parsed.windowId !== windowId) return null;
    if (!Array.isArray(parsed.ntas) || parsed.ntas.length === 0) return null;
    // Results written before the block grid existed have no `blocks` array,
    // and results from before the address rollups have no `topAddresses`.
    if (!Array.isArray(parsed.blocks)) return null;
    if (!Array.isArray(parsed.ntas[0].topAddresses)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedAggregate(result: AggregateResult): void {
  try {
    window.localStorage.setItem(
      cacheKey(result.dataset, result.windowId),
      JSON.stringify(result),
    );
  } catch {
    // Storage may be full or blocked; the app still works without the cache.
  }
}

export function clearAggregateCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("nycma:aggregate:")) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Ignore: nothing to clear.
  }
}
