import { useSyncExternalStore } from "react";

/**
 * Shared on/off store for the quick Layers drawer: Businesses (storefront
 * signs), Street art and the global X-ray (underground trains). Persisted in
 * localStorage; any module can read it (`getQuickLayer`) or subscribe
 * (`useQuickLayer`). Transit Focus, Restrooms and Events keep their own stores.
 */
export type QuickId = "businesses" | "streetArt" | "xray";
const KEY = "nma.quickLayers";
const DEFAULTS: Record<QuickId, boolean> = { businesses: true, streetArt: true, xray: false };

function load(): Record<QuickId, boolean> {
  try {
    return { ...DEFAULTS, ...(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}") as Partial<Record<QuickId, boolean>>) };
  } catch {
    return { ...DEFAULTS };
  }
}
let state = load();
const subs = new Set<() => void>();

export function setQuickLayer(id: QuickId, on: boolean): void {
  state = { ...state, [id]: on };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f());
}
export const getQuickLayer = (id: QuickId): boolean => state[id];
export function useQuickLayer(id: QuickId): boolean {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state[id], () => state[id]);
}
