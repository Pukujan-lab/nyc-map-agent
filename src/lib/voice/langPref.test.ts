import { afterEach, describe, expect, it } from "vitest";
import { APP_LANGS, LANG_KEY, parseLang, readLang, setLangPref } from "./langPref";

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    has: (k: string) => m.has(k),
  };
}

afterEach(() => setLangPref(null, fakeStorage()));

describe("language preference", () => {
  it("uses the browser when nothing valid is stored", () => {
    expect(parseLang(null)).toBeNull();
    expect(parseLang("")).toBeNull();
    expect(parseLang("de")).toBeNull();
    expect(parseLang("es-MX")).toBeNull();
    expect(readLang(fakeStorage())).toBeNull();
    expect(readLang(fakeStorage({ [LANG_KEY]: "nope" }))).toBeNull();
  });

  it("keeps one of the eight spoken languages and clears it back to the browser", () => {
    const s = fakeStorage();
    for (const code of APP_LANGS) {
      setLangPref(code, s);
      expect(readLang(s)).toBe(code);
      expect(s.getItem(LANG_KEY)).toBe(code);
    }
    setLangPref(null, s);
    expect(readLang(s)).toBeNull();
    expect(s.has(LANG_KEY)).toBe(false);
  });
});
