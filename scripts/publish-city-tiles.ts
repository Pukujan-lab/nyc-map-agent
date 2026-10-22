/**
 * Publishes public/tiles/nyc-city.pmtiles through Octo files (stored in R2,
 * served from Octo's public bucket domain) and records the parts in
 * core.published_assets for /api/city-tiles.
 *
 * Octo uploads are one JSON request with base64 data and the edge caps a
 * request at 100 MB, so the file goes up in parts of PART_MB (default 40).
 *
 *   pnpm build:city-tiles && pnpm publish:city-tiles
 *   pnpm build:block-tiles && pnpm publish:block-tiles   (any file: pass its path)
 *   add --dry-run to report what would be uploaded and pruned without changing anything
 *
 * After upload the new parts are verified (each part fetchable, total bytes and
 * sha256 etag match) and swapped in; the old current version becomes
 * previous_parts (kept for rollback) and the Octo files of the version that was
 * previous before are deleted. If verification fails nothing is deleted and the
 * old pointer stays. Deleting needs an OCTO_API_KEY with the `delete` scope and
 * an owner/admin workspace role; on 403 the prune is skipped with a warning.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { octoConfigFromEnv, octoQuery } from "../api/_lib/octo";
import { assetEtag, selectPrunable, verifyParts, type AssetPart } from "./asset-prune";
import { loadEnv } from "./env";

const DRY_RUN = process.argv.includes("--dry-run");
const ARGS = process.argv.slice(2).filter((a) => a !== "--dry-run");
const FILE = ARGS[0] ?? process.env.CITY_TILES_FILE ?? "public/tiles/nyc-city.pmtiles";
/** core.published_assets name, e.g. nyc-city.pmtiles / nyc-blocks.pmtiles. */
const NAME = basename(FILE);
const PART_BYTES = Number(process.env.PART_MB ?? 40) * 1024 * 1024;

async function call(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const { baseUrl, apiKey } = octoConfigFromEnv();
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

async function deleteFile(fileId: string, workspaceId: string): Promise<number> {
  const { baseUrl, apiKey } = octoConfigFromEnv();
  const res = await fetch(`${baseUrl}/api/files/${fileId}?workspaceId=${workspaceId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  return res.status;
}

async function prune(fileIds: string[], workspaceId: string) {
  for (const fileId of fileIds) {
    const status = await deleteFile(fileId, workspaceId);
    if (status === 403) {
      console.warn("prune skipped: key lacks delete scope");
      return;
    }
    if (status >= 200 && status < 300) console.log(`pruned ${fileId}`);
    else if (status === 404) console.log(`already gone ${fileId}`);
    else console.warn(`prune of ${fileId} failed (${status}); continuing`);
  }
}

async function main() {
  loadEnv();
  const { workspaceId } = octoConfigFromEnv();
  const bytes = readFileSync(FILE);
  const etag = assetEtag(bytes);
  const existing = (
    await octoQuery<{ parts: AssetPart[] | null; previous_parts: AssetPart[] | null }>(
      "SELECT parts, previous_parts FROM core.published_assets WHERE name = $1",
      [NAME],
    )
  ).rows[0];
  if (DRY_RUN) {
    const fake = [{ fileId: "(new)", url: "", bytes: bytes.length }];
    const ids = selectPrunable(existing?.previous_parts, existing?.parts, fake);
    console.log(`[dry-run] ${NAME}: would upload ${(bytes.length / 1e6).toFixed(1)} MB, etag ${etag}`);
    console.log(`[dry-run] would keep ${existing?.parts?.length ?? 0} current parts as previous`);
    console.log(`[dry-run] would prune ${ids.length} files: ${ids.join(", ") || "none"}`);
    return;
  }
  const parts: AssetPart[] = [];
  for (let offset = 0, i = 0; offset < bytes.length; offset += PART_BYTES, i++) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + PART_BYTES));
    const uploaded = await call("/api/files/upload", {
      workspaceId,
      name: `${NAME}.${etag.slice(0, 8)}.part${i}`,
      mimeType: "application/octet-stream",
      data: chunk.toString("base64"),
      dataEncoding: "base64",
    });
    const fileId = String(uploaded.id);
    const published = await call(`/api/files/${fileId}/publish?workspaceId=${workspaceId}`);
    parts.push({ fileId, url: String(published.url), bytes: chunk.length });
    console.log(`part ${i}: ${(chunk.length / 1e6).toFixed(1)} MB published`);
  }
  const problem = await verifyParts(parts, { totalBytes: bytes.length, etag });
  if (problem) {
    throw new Error(`verification failed, kept old pointer and deleted nothing: ${problem}`);
  }
  // Swap: the old current version becomes the rollback version.
  await octoQuery(
    `INSERT INTO core.published_assets (name, total_bytes, etag, parts, published_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (name) DO UPDATE SET
       previous_parts = core.published_assets.parts,
       previous_etag = core.published_assets.etag,
       previous_total_bytes = core.published_assets.total_bytes,
       total_bytes = excluded.total_bytes, etag = excluded.etag,
       parts = excluded.parts, published_at = now()`,
    [NAME, bytes.length, etag, JSON.stringify(parts)],
  );
  console.log(`${NAME}: ${(bytes.length / 1e6).toFixed(1)} MB in ${parts.length} parts, etag ${etag}`);
  await prune(selectPrunable(existing?.previous_parts, existing?.parts, parts), workspaceId);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
