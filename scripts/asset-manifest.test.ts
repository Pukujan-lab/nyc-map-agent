import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundledAssets } from "./asset-manifest";

describe("bundledAssets", () => {
  it("hashes tile and model files only, sorted, with posix paths", () => {
    const root = mkdtempSync(join(tmpdir(), "am-"));
    mkdirSync(join(root, "tiles"));
    writeFileSync(join(root, "tiles", "b.pmtiles"), "b");
    writeFileSync(join(root, "a.glb"), "a");
    writeFileSync(join(root, "index.html"), "x");
    const out = bundledAssets(root);
    expect(out.map((a) => a.path)).toEqual(["a.glb", "tiles/b.pmtiles"]);
    expect(out[0]).toEqual({ path: "a.glb", sha256: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb", bytes: 1 });
  });
});
