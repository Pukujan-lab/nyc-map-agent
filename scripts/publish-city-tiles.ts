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
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { octoConfigFromEnv, octoQuery } from "../api/_lib/octo";
import { loadEnv } from "./env";

const FILE = process.argv[2] ?? process.env.CITY_TILES_FILE ?? "public/tiles/nyc-city.pmtiles";
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

async function main() {
  loadEnv();
  const { workspaceId } = octoConfigFromEnv();
  const bytes = readFileSync(FILE);
  const etag = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const parts: Array<{ fileId: string; url: string; bytes: number }> = [];
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
  await octoQuery(
    `INSERT INTO core.published_assets (name, total_bytes, etag, parts, published_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (name) DO UPDATE SET total_bytes = excluded.total_bytes, etag = excluded.etag,
       parts = excluded.parts, published_at = now()`,
    [NAME, bytes.length, etag, JSON.stringify(parts)],
  );
  console.log(`${NAME}: ${(bytes.length / 1e6).toFixed(1)} MB in ${parts.length} parts, etag ${etag}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
