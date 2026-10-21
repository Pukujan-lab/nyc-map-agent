/**
 * Pure helpers for the publish flow in publish-city-tiles.ts: verifying a newly
 * uploaded multi-part asset and choosing which old Octo files may be deleted.
 */
import { createHash } from "node:crypto";

export interface AssetPart {
  fileId: string;
  url: string;
  bytes: number;
}

/** Etag format stored in core.published_assets: first 32 hex chars of sha256. */
export function assetEtag(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 32);
}

/**
 * File ids safe to delete after `next` was swapped in and `current` became the
 * rollback version. Only ids from the version that was previous before the
 * swap are candidates; ids of the new current or the new previous version are
 * never returned, even if they overlap.
 */
export function selectPrunable(
  oldPrevious: AssetPart[] | null | undefined,
  current: AssetPart[] | null | undefined,
  next: AssetPart[],
): string[] {
  const keep = new Set([...(current ?? []), ...next].map((p) => p.fileId));
  const out: string[] = [];
  for (const p of oldPrevious ?? []) {
    if (p?.fileId && !keep.has(p.fileId) && !out.includes(p.fileId)) out.push(p.fileId);
  }
  return out;
}

/**
 * Fetches every part and checks per-part bytes, the total and the sha256 etag.
 * Returns an error message, or null when the upload is good.
 */
export async function verifyParts(
  parts: AssetPart[],
  expected: { totalBytes: number; etag: string },
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const hash = createHash("sha256");
  let total = 0;
  for (const [i, p] of parts.entries()) {
    let buf: Uint8Array;
    try {
      const res = await fetchFn(p.url);
      if (!res.ok) return `part ${i} not fetchable (${res.status})`;
      buf = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      return `part ${i} not fetchable (${err instanceof Error ? err.message : String(err)})`;
    }
    if (buf.length !== p.bytes) return `part ${i} is ${buf.length} bytes, expected ${p.bytes}`;
    hash.update(buf);
    total += buf.length;
  }
  if (total !== expected.totalBytes) return `total ${total} bytes, expected ${expected.totalBytes}`;
  const etag = hash.digest("hex").slice(0, 32);
  if (etag !== expected.etag) return `etag ${etag} does not match ${expected.etag}`;
  return null;
}
