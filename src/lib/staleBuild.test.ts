import { describe, expect, it, vi } from "vitest";
import { isChunkError, reloadOnce } from "./staleBuild";

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("stale build", () => {
  it("knows a missing chunk from other errors", () => {
    expect(isChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/MyDay-abc.js"))).toBe(true);
    expect(isChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkError(new TypeError("Cannot read properties of undefined (reading 'at')"))).toBe(false);
  });
  it("reloads once a minute at most", () => {
    const s = store();
    const reload = vi.fn();
    expect(reloadOnce(s, 1_000, reload)).toBe(true);
    expect(reloadOnce(s, 30_000, reload)).toBe(false);
    expect(reloadOnce(s, 70_000, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
