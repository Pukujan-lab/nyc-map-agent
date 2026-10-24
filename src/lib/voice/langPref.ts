import { useSyncExternalStore } from "react";

/**
 * The language the agent and its voice use (#370). Stored on this phone as
 * `nma.lang`. Null means the browser's language. The eight tags are the ones
 * the spoken status lines already cover.
 */
export const LANG_KEY = "nma.lang";
export const APP_LANGS = ["en", "es", "zh", "ru", "bn", "ht", "fr", "ko"] as const;
export type AppLang = (typeof APP_LANGS)[number];

export const LANG_LABELS: Record<AppLang, string> = {
  en: "English",
  es: "Español",
  zh: "中文",
  ru: "Русский",
  bn: "বাংলা",
  ht: "Kreyòl",
  fr: "Français",
  ko: "한국어",
};

const CODES = new Set<string>(APP_LANGS);

/** A stored tag we accept, or null (use the browser). Anything else is null. */
export function parseLang(raw: string | null | undefined): AppLang | null {
  return raw && CODES.has(raw) ? (raw as AppLang) : null;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): Store | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function readLang(storage: Pick<Storage, "getItem"> | undefined = local()): AppLang | null {
  try {
    return parseLang(storage?.getItem(LANG_KEY));
  } catch {
    return null;
  }
}

let current: AppLang | null = readLang();
const subs = new Set<() => void>();

export function setLangPref(next: AppLang | null, storage: Store | undefined = local()): void {
  current = parseLang(next);
  try {
    if (current) storage?.setItem(LANG_KEY, current);
    else storage?.removeItem(LANG_KEY);
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f());
}

export function useLangPref(): AppLang | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => current, () => current);
}
