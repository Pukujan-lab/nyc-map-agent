/**
 * Build-time asset manifest: dist/asset-manifest.json ties one app build to
 * the exact asset set it was built and tested with.
 *
 *   app     package name, version and git commit of the build
 *   bundled sha256 + bytes of every tile / model file shipped in dist/
 *   published  the core.asset_current pointer (name -> sha256) at build time,
 *              when OCTO_* is configured; otherwise null ("unpinned")
 *
 * Runs after `vite build` (see package.json "build"). Compare a running app's
 * /asset-manifest.json with core.asset_versions to know which tile set it saw;
 * roll back by moving core.asset_current to the sha256 recorded here.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import pkg from "../package.json";

export interface AssetManifest {
  schema: 1;
  app: { name: string; version: string; commit: string | null; builtAt: string };
  bundled: Array<{ path: string; sha256: string; bytes: number }>;
  published: Record<string, string> | null;
}

const ASSET_EXT = /\.(pmtiles|glb|gltf|geojson)$/i;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function bundledAssets(root: string): AssetManifest["bundled"] {
  return walk(root)
    .filter((p) => ASSET_EXT.test(p))
    .sort()
    .map((p) => {
      const bytes = readFileSync(p);
      return { path: relative(root, p).split("\\").join("/"), sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
    });
}

function gitCommit(): string | null {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

async function publishedPointers(): Promise<Record<string, string> | null> {
  if (!process.env.OCTO_API_KEY) return null;
  try {
    const { octoQuery } = await import("../api/_lib/octo");
    const { rows } = await octoQuery<{ name: string; sha256: string }>("SELECT name, sha256 FROM core.asset_current ORDER BY name");
    return Object.fromEntries(rows.map((r) => [r.name, r.sha256]));
  } catch (err) {
    console.warn(`asset-manifest: published pointers unavailable (${err instanceof Error ? err.message : String(err)})`);
    return null;
  }
}

async function main() {
  const out = process.argv[2] ?? "dist";
  const manifest: AssetManifest = {
    schema: 1,
    app: { name: pkg.name, version: pkg.version, commit: gitCommit(), builtAt: new Date().toISOString() },
    bundled: bundledAssets(out),
    published: await publishedPointers(),
  };
  writeFileSync(join(out, "asset-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `asset-manifest: ${manifest.app.version} @ ${manifest.app.commit?.slice(0, 7) ?? "?"}, ${manifest.bundled.length} bundled, ` +
      `${manifest.published ? Object.keys(manifest.published).length + " published pins" : "published unpinned"}`,
  );
}

if (process.argv[1]?.endsWith("asset-manifest.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
