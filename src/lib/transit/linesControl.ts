import { useSyncExternalStore } from "react";

/** The Lines button, published by the transit layer while a system is on. */
export type LinesControl = { count: number; open: () => void };

let current: LinesControl | null = null;
const subs = new Set<() => void>();

export function setLinesControl(next: LinesControl | null) {
  current = next;
  subs.forEach((f) => f());
}

export function useLinesControl(): LinesControl | null {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => current,
  );
}
