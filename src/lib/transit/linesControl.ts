import { useSyncExternalStore } from "react";

/** The Lines button lives with the view controls; the transit layer registers what it opens. */
let openLines: (() => void) | null = null;
const subs = new Set<() => void>();

export function setLinesControl(fn: (() => void) | null): void {
  openLines = fn;
  subs.forEach((f) => f());
}

export function useLinesControl(): (() => void) | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => openLines, () => null);
}
