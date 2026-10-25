/**
 * The build's asset manifest (#203): `vite build` writes asset-manifest.json
 * beside index.html, listing every file the build ships with its size and
 * sha256, and the commit it was built from. Tile sets published through Octo
 * are not files of the build; core.published_asset_versions records when each
 * one was current, so the deploy time of this manifest's commit names them.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

export const MANIFEST_FILE = "asset-manifest.json";

export interface AssetManifest {
  commit: string | null;
  builtAt: string;
  files: Record<string, { bytes: number; sha256: string }>;
  publishedAssets: string;
}

export function buildManifest(files: { path: string; bytes: Uint8Array }[], commit: string | null, builtAt: Date): AssetManifest {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    commit,
    builtAt: builtAt.toISOString(),
    files: Object.fromEntries(
      sorted.map((f) => [f.path, { bytes: f.bytes.length, sha256: createHash("sha256").update(f.bytes).digest("hex") }]),
    ),
    publishedAssets: "core.published_asset_versions, the row per name whose published_at..retired_at spans this build's deploy",
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** The image build passes GIT_SHA (it has no .git); a local build asks git. */
function commitSha(): string | null {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function assetManifest(): Plugin {
  let outDir = "dist";
  return {
    name: "asset-manifest",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = walk(outDir)
        .map((full) => ({ path: relative(outDir, full).split(sep).join("/"), full }))
        .filter((f) => f.path !== MANIFEST_FILE)
        .map((f) => ({ path: f.path, bytes: readFileSync(f.full) }));
      writeFileSync(join(outDir, MANIFEST_FILE), JSON.stringify(buildManifest(files, commitSha(), new Date()), null, 2) + "\n");
    },
  };
}
