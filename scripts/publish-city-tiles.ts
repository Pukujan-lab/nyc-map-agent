/**
 * Publishes public/tiles/nyc-city.pmtiles through Octo files (stored in R2,
 * served from Octo's public bucket domain) and records the parts in
 * core.asset_versions (one row per name + sha256) with core.asset_current
 * pointing at the served version; core.published_assets is a view over them
 * that /api/city-tiles reads.
 *
 * Octo uploads are one JSON request with base64 data and the edge caps a
 * request at 100 MB, so the file goes up in parts of PART_MB (default 40).
 *
 *   pnpm build:city-tiles && pnpm publish:city-tiles
 *   pnpm build:block-tiles && pnpm publish:block-tiles   (any file: pass its path)
 *   add --dry-run to report what would be uploaded and pruned without changing anything
 *
 * After upload the new parts are verified (each part fetchable, total bytes and
 * sha256 etag match), recorded as a version and the pointer moved in one
 * statement; the old current version is kept for rollback and the Octo files
 * of any older version are deleted (their history rows stay, with pruned_at).
 * Publishing a file whose sha256 is already a stored, unpruned version only
 * moves the pointer. If verification fails nothing is deleted and the
 * old pointer stays. Deleting needs an OCTO_API_KEY with the `delete` scope and
 * an owner/admin workspace role; on 403 the prune is skipped with a warning.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { octoConfigFromEnv, octoQuery } from "../api/_lib/octo";
import { assetEtag, assetSha256, selectPrunable, verifyParts, versionsToPrune, type AssetPart, type AssetVersion } from "./asset-prune";
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

/** Deletes the files; false when the key cannot delete (nothing is marked pruned then). */
async function prune(fileIds: string[], workspaceId: string): Promise<boolean> {
  for (const fileId of fileIds) {
    const status = await deleteFile(fileId, workspaceId);
    if (status === 403) {
      console.warn("prune skipped: key lacks delete scope");
      return false;
    }
    if (status >= 200 && status < 300) console.log(`pruned ${fileId}`);
    else if (status === 404) console.log(`already gone ${fileId}`);
    else console.warn(`prune of ${fileId} failed (${status}); continuing`);
  }
  return true;
}

const parseParts = (p: unknown) => (typeof p === "string" ? JSON.parse(p) : p) as AssetPart[];

async function main() {
  loadEnv();
  const { workspaceId } = octoConfigFromEnv();
  const bytes = readFileSync(FILE);
  const sha256 = assetSha256(bytes);
  const etag = assetEtag(bytes);
  // History: core.asset_versions (name, sha256) + core.asset_current pointer.
  const { rows } = await octoQuery<{ sha256: string; parts: unknown; pruned: boolean; current: boolean }>(
    `SELECT v.sha256, v.parts, v.pruned_at IS NOT NULL AS pruned, (c.sha256 = v.sha256) AS current
     FROM core.asset_versions v LEFT JOIN core.asset_current c ON c.name = v.name
     WHERE v.name = $1 ORDER BY v.published_at DESC`,
    [NAME],
  );
  const versions: AssetVersion[] = rows.map((r) => ({ sha256: r.sha256, parts: parseParts(r.parts), pruned: Boolean(r.pruned) }));
  const current = versions.find((_, i) => rows[i].current);
  if (current?.sha256 === sha256) {
    console.log(`${NAME}: ${sha256} is already current; nothing to do`);
    return;
  }
  const stale = versionsToPrune(versions, current?.sha256, sha256);
  const reuse = versions.find((v) => v.sha256 === sha256 && !v.pruned);
  if (DRY_RUN) {
    const fake = reuse?.parts ?? [{ fileId: "(new)", url: "", bytes: bytes.length }];
    const ids = selectPrunable(stale.flatMap((v) => v.parts), current?.parts, fake);
    console.log(`[dry-run] ${NAME}: sha256 ${sha256}, ${reuse ? "re-point to existing version" : `would upload ${(bytes.length / 1e6).toFixed(1)} MB`}`);
    console.log(`[dry-run] would keep current ${current?.sha256 ?? "(none)"} as the rollback version`);
    console.log(`[dry-run] would prune ${ids.length} files from ${stale.length} older versions: ${ids.join(", ") || "none"}`);
    return;
  }
  let parts: AssetPart[];
  if (reuse) {
    parts = reuse.parts;
    console.log(`${NAME}: ${sha256} already uploaded; re-pointing`);
  } else {
    parts = [];
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
  }
  const problem = await verifyParts(parts, { totalBytes: bytes.length, etag });
  if (problem) {
    throw new Error(`verification failed, kept old pointer and deleted nothing: ${problem}`);
  }
  // One statement: record the version and move the pointer atomically.
  await octoQuery(
    `WITH v AS (
       INSERT INTO core.asset_versions (name, sha256, total_bytes, etag, parts, published_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, now())
       ON CONFLICT (name, sha256) DO UPDATE SET
         total_bytes = excluded.total_bytes, etag = excluded.etag, parts = excluded.parts,
         published_at = now(), pruned_at = NULL
       RETURNING name, sha256
     )
     INSERT INTO core.asset_current (name, sha256, updated_at)
     SELECT name, sha256, now() FROM v
     ON CONFLICT (name) DO UPDATE SET sha256 = excluded.sha256, updated_at = now()`,
    [NAME, sha256, bytes.length, etag, JSON.stringify(parts)],
  );
  console.log(`${NAME}: ${(bytes.length / 1e6).toFixed(1)} MB in ${parts.length} parts, sha256 ${sha256}`);
  const ids = selectPrunable(stale.flatMap((v) => v.parts), current?.parts, parts);
  if (stale.length && (await prune(ids, workspaceId))) {
    await octoQuery("UPDATE core.asset_versions SET pruned_at = now() WHERE name = $1 AND sha256 IN (SELECT jsonb_array_elements_text($2::jsonb))",
      [NAME, JSON.stringify(stale.map((v) => v.sha256))],
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
