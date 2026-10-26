import { describe, expect, it } from "vitest";
import { buildManifest } from "./asset-manifest";

describe("build asset manifest (#203)", () => {
  const at = new Date("2026-10-25T12:00:00Z");
  const enc = (s: string) => new TextEncoder().encode(s);

  it("lists every file with its size and sha256, in path order", () => {
    const m = buildManifest([{ path: "transit/subway.json", bytes: enc("{}") }, { path: "index.html", bytes: enc("abc") }], "613d0ca", at);
    expect(Object.keys(m.files)).toEqual(["index.html", "transit/subway.json"]);
    expect(m.files["index.html"]).toEqual({ bytes: 3, sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" });
    expect(m.commit).toBe("613d0ca");
    expect(m.builtAt).toBe("2026-10-25T12:00:00.000Z");
  });

  it("says where the published tile versions are recorded", () => {
    expect(buildManifest([], null, at).publishedAssets).toContain("core.published_asset_versions");
  });
});
