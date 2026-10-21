import { describe, expect, it } from "vitest";
import { RouteSignCache, signFace } from "./routeSign";

describe("route sign faces", () => {
  it("gives each line its own colour and letter", () => {
    expect(signFace("A")).toMatchObject({ text: "A", color: "#0039A6", ink: "#FFFFFF" });
    expect(signFace("Q")).toMatchObject({ text: "Q", color: "#FCCC0A", ink: "#111111" });
    expect(signFace("6X")).toMatchObject({ text: "6", express: true, color: "#00933C" });
    expect(signFace("GS").text).toBe("S");
    expect(signFace("A").key).not.toBe(signFace("Q").key);
    expect(signFace("6").key).not.toBe(signFace("6X").key);
  });
});

describe("RouteSignCache", () => {
  const setup = () => {
    const made: string[] = [], disposed: string[] = [];
    const cache = new RouteSignCache((f) => { made.push(f.key); return { key: f.key, dispose: () => disposed.push(f.key) }; });
    return { cache, made, disposed };
  };
  it("builds one sign per route, keyed by route, and reuses it", () => {
    const { cache, made } = setup();
    const a1 = cache.get(signFace("A")), q = cache.get(signFace("Q")), a2 = cache.get(signFace("A"));
    expect(a1).toBe(a2);
    expect(a1).not.toBe(q);
    expect(made).toHaveLength(2);
  });
  it("disposes signs no train shows any more, and everything on clear", () => {
    const { cache, disposed } = setup();
    const a = signFace("A"), n = signFace("N");
    cache.get(a); cache.get(n);
    expect(cache.prune(new Set([a.key]))).toEqual([n.key]);
    expect(disposed).toEqual([n.key]);
    cache.clear();
    expect(disposed).toEqual([n.key, a.key]);
    expect(cache.size).toBe(0);
  });
});
