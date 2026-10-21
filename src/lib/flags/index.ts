import { useSyncExternalStore } from "react";
import { resolveFlags, type FlagId } from "./registry";

export * from "./registry";

const KEY = "nma:advancedMode";
const listeners = new Set<() => void>();

function readAdvanced(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAdvancedMode(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, on ? "1" : "0");
  } catch {
    /* private mode: the setting just does not persist */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  globalThis.addEventListener?.("storage", onStorage);
  return () => {
    listeners.delete(cb);
    globalThis.removeEventListener?.("storage", onStorage);
  };
}

/** Persisted user setting (localStorage); default false = simple mode. */
export function useAdvancedMode(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readAdvanced, () => false);
  return [on, setAdvancedMode];
}

/** All resolved flags: default, VITE_FLAGS, ?flags=, then the advanced tier gate. */
export function useFlags(): Record<FlagId, boolean> {
  const [advancedMode] = useAdvancedMode();
  const url = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("flags");
  return resolveFlags({ env: import.meta.env.VITE_FLAGS, url, advancedMode });
}

export function useFlag(id: FlagId): boolean {
  return useFlags()[id];
}
