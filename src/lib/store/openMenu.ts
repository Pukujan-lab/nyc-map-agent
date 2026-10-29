import { useSyncExternalStore } from "react";

/**
 * The one open dropdown on the agent-first home (#370): a menu in the top-left
 * row or the Change view menu on the right. Opening one closes the other.
 */
export type OpenMenu = "myDay" | "layers" | "filters" | "data" | "cityData" | "settings" | "view" | null;

let open: OpenMenu = null;
const subs = new Set<() => void>();

export function setOpenMenu(next: OpenMenu): void {
  if (next === open) return;
  open = next;
  subs.forEach((f) => f());
}

export function useOpenMenu(): OpenMenu {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => open, () => null);
}
