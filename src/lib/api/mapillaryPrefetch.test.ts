import { describe, expect, it, vi } from "vitest";
import {
  RecentSet,
  createThumbPrefetcher,
  fetchSequenceImageIds,
  fetchThumbUrls,
  nextImageIds,
} from "@/lib/api/mapillaryPrefetch";

const seq = ["a", "b", "c", "d", "e", "f"];

describe("nextImageIds", () => {
  it("returns the next N in order", () => {
    expect(nextImageIds(seq, "b", 3)).toEqual(["c", "d", "e"]);
  });
  it("stops at the end of the sequence", () => {
    expect(nextImageIds(seq, "e", 4)).toEqual(["f"]);
    expect(nextImageIds(seq, "f", 4)).toEqual([]);
  });
  it("walks backwards nearest first", () => {
    expect(nextImageIds(seq, "d", 2, "prev")).toEqual(["c", "b"]);
    expect(nextImageIds(seq, "a", 2, "prev")).toEqual([]);
  });
  it("is empty for unknown ids or non-positive counts", () => {
    expect(nextImageIds(seq, "zz", 3)).toEqual([]);
    expect(nextImageIds(seq, "a", 0)).toEqual([]);
  });
});

describe("RecentSet", () => {
  it("evicts the least recently used", () => {
    const s = new RecentSet(2);
    s.add("a");
    s.add("b");
    s.has("a");
    s.add("c");
    expect(s.has("b")).toBe(false);
    expect(s.has("a")).toBe(true);
    expect(s.size).toBe(2);
  });
});

describe("createThumbPrefetcher", () => {
  it("loads each thumbnail once and skips missing urls", async () => {
    const load = vi.fn<(url: string) => void>();
    const resolveUrls = vi.fn((ids: readonly string[]) =>
      Promise.resolve(
        new Map<string, string | null>(
          ids.map((id) => [id, id === "c" ? null : `u/${id}`]),
        ),
      ),
    );
    const p = createThumbPrefetcher({ resolveUrls, load });
    expect(await p.prefetch(["b", "c"])).toEqual(["b"]);
    expect(await p.prefetch(["b", "d"])).toEqual(["d"]);
    expect(load.mock.calls.map(([u]) => u)).toEqual(["u/b", "u/d"]);
    expect(resolveUrls).toHaveBeenLastCalledWith(["d"]);
  });
  it("does not resolve when everything is cached", async () => {
    const resolveUrls = vi.fn(() =>
      Promise.resolve(new Map<string, string | null>([["b", "u/b"]])),
    );
    const p = createThumbPrefetcher({ resolveUrls, load: vi.fn() });
    await p.prefetch(["b"]);
    await p.prefetch(["b"]);
    expect(resolveUrls).toHaveBeenCalledTimes(1);
  });
});

describe("graph fetch helpers (mocked fetch)", () => {
  it("parses sequence ids in order", async () => {
    const f = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [{ id: "1" }, { id: "2" }] })),
      ),
    ) as unknown as typeof fetch;
    expect(await fetchSequenceImageIds("s", f)).toEqual(["1", "2"]);
  });
  it("maps thumbs and tolerates failures", async () => {
    const f = vi.fn((url: string) =>
      Promise.resolve(
        url.includes("/1?")
          ? new Response(JSON.stringify({ id: "1", thumb_1024_url: "u1" }))
          : new Response("no", { status: 500 }),
      ),
    ) as unknown as typeof fetch;
    const m = await fetchThumbUrls(["1", "2"], f);
    expect(m.get("1")).toBe("u1");
    expect(m.get("2")).toBeNull();
  });
});
