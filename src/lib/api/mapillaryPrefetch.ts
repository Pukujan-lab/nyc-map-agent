import { z } from "zod";
import { MAPILLARY_TOKEN } from "@/lib/api/mapillary";

/**
 * Thumbnail prefetch for walking a Mapillary sequence.
 *
 * The viewer only knows about an image once it has loaded it, so each step
 * shows a blank frame while the next photo downloads. Here we look ahead along
 * the sequence and warm the browser cache with the next few thumbnails.
 */

export const PREFETCH_AHEAD = 4;
export const THUMB_CACHE_SIZE = 24;

/**
 * The next `count` ids after `currentId` in sequence order, in the direction of
 * travel. Returns [] when the current image is not in the sequence.
 */
export function nextImageIds(
  sequence: readonly string[],
  currentId: string,
  count = PREFETCH_AHEAD,
  direction: "next" | "prev" = "next",
): string[] {
  const at = sequence.indexOf(currentId);
  if (at === -1 || count <= 0) return [];
  if (direction === "next") return sequence.slice(at + 1, at + 1 + count);
  return sequence.slice(Math.max(0, at - count), at).reverse();
}

/**
 * Small least-recently-used set. Tracks which ids were already requested so a
 * back-and-forth walk does not re-download, and evicts the oldest past `max`.
 */
export class RecentSet {
  private readonly items = new Map<string, true>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  has(key: string): boolean {
    if (!this.items.has(key)) return false;
    this.items.delete(key);
    this.items.set(key, true);
    return true;
  }

  add(key: string): void {
    this.items.delete(key);
    this.items.set(key, true);
    while (this.items.size > this.max) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) break;
      this.items.delete(oldest);
    }
  }

  get size(): number {
    return this.items.size;
  }
}

export interface ThumbPrefetcher {
  /** Warm the thumbnails for these ids; resolves to the ids actually fetched. */
  prefetch(ids: readonly string[]): Promise<string[]>;
}

export interface PrefetcherDeps {
  /** Resolves ids to thumbnail urls (null when an image has none). */
  resolveUrls: (ids: readonly string[]) => Promise<Map<string, string | null>>;
  /** Starts a download of one url. Defaults to an `Image` element. */
  load?: (url: string) => void;
  cacheSize?: number;
}

export function createThumbPrefetcher(deps: PrefetcherDeps): ThumbPrefetcher {
  const seen = new RecentSet(deps.cacheSize ?? THUMB_CACHE_SIZE);
  const load =
    deps.load ??
    ((url: string) => {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    });

  return {
    async prefetch(ids) {
      const fresh = ids.filter((id) => !seen.has(id));
      if (fresh.length === 0) return [];
      const urls = await deps.resolveUrls(fresh);
      const fetched: string[] = [];
      for (const id of fresh) {
        const url = urls.get(id);
        if (!url) continue;
        seen.add(id);
        load(url);
        fetched.push(id);
      }
      return fetched;
    },
  };
}

const idsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });
const thumbSchema = z.object({
  id: z.string(),
  thumb_1024_url: z.string().nullish(),
});

/** Image ids of a sequence, in capture order. */
export async function fetchSequenceImageIds(
  sequenceId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const params = new URLSearchParams({
    access_token: MAPILLARY_TOKEN,
    sequence_id: sequenceId,
  });
  const response = await fetchImpl(
    `https://graph.mapillary.com/image_ids?${params.toString()}`,
  );
  if (!response.ok) throw new Error(`Mapillary returned ${response.status}.`);
  const parsed = idsSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Unexpected Mapillary response shape.");
  return parsed.data.data.map((row) => row.id);
}

/** Thumbnail urls for a handful of image ids. Failures yield null entries. */
export async function fetchThumbUrls(
  ids: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const params = new URLSearchParams({
          access_token: MAPILLARY_TOKEN,
          fields: "id,thumb_1024_url",
        });
        const response = await fetchImpl(
          `https://graph.mapillary.com/${encodeURIComponent(id)}?${params.toString()}`,
        );
        const parsed = thumbSchema.safeParse(
          response.ok ? await response.json() : null,
        );
        out.set(id, parsed.success ? (parsed.data.thumb_1024_url ?? null) : null);
      } catch {
        out.set(id, null);
      }
    }),
  );
  return out;
}
