import { describe, expect, it } from "vitest";
import { assetEtag, assetSha256, selectPrunable, verifyParts, versionsToPrune, type AssetPart } from "./asset-prune";

const part = (fileId: string, bytes = 1): AssetPart => ({ fileId, url: `https://x/${fileId}`, bytes });

describe("selectPrunable", () => {
  it("deletes only the version that was previous before the swap", () => {
    expect(selectPrunable([part("a0"), part("a1")], [part("b0")], [part("c0")])).toEqual(["a0", "a1"]);
  });
  it("returns nothing on first or second publish", () => {
    expect(selectPrunable(null, null, [part("c0")])).toEqual([]);
    expect(selectPrunable(null, [part("b0")], [part("c0")])).toEqual([]);
  });
  it("never returns current or new ids, and dedupes", () => {
    expect(selectPrunable([part("b0"), part("c0"), part("a0"), part("a0")], [part("b0")], [part("c0")])).toEqual(["a0"]);
  });
});

describe("verifyParts", () => {
  const data = new TextEncoder().encode("helloworld");
  const parts = [{ ...part("p0", 5), url: "u0" }, { ...part("p1", 5), url: "u1" }];
  const bodies: Record<string, Uint8Array> = { u0: data.subarray(0, 5), u1: data.subarray(5) };
  const ok = ((u: string) => Promise.resolve(new Response(bodies[u]))) as unknown as typeof fetch;
  const expected = { totalBytes: 10, etag: assetEtag(data) };

  it("accepts a matching upload", async () => {
    expect(await verifyParts(parts, expected, ok)).toBeNull();
  });
  it("rejects an unfetchable part", async () => {
    const bad = ((u: string) => Promise.resolve(u === "u1" ? new Response("", { status: 404 }) : new Response(bodies[u]))) as unknown as typeof fetch;
    expect(await verifyParts(parts, expected, bad)).toMatch(/part 1 not fetchable/);
  });
  it("rejects an etag mismatch", async () => {
    expect(await verifyParts(parts, { ...expected, etag: "0".repeat(32) }, ok)).toMatch(/etag/);
  });
});

describe("versionsToPrune", () => {
  const v = (sha256: string, pruned = false) => ({ sha256, parts: [part(`${sha256}0`)], pruned });
  it("keeps the new current and the version it replaces, prunes older unpruned ones", () => {
    const out = versionsToPrune([v("a"), v("b", true), v("c"), v("d")], "c", "d");
    expect(out.map((x) => x.sha256)).toEqual(["a"]);
  });
  it("first publish prunes nothing", () => {
    expect(versionsToPrune([], null, "a")).toEqual([]);
  });
});

describe("assetSha256", () => {
  it("is the full hex digest and the etag is its prefix", () => {
    const data = new TextEncoder().encode("x");
    expect(assetSha256(data)).toHaveLength(64);
    expect(assetSha256(data).startsWith(assetEtag(data))).toBe(true);
  });
});
