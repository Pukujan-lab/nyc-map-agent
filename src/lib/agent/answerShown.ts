import { useSyncExternalStore } from "react";

/**
 * Whether the assistant's answer sheet (or the listening orb) is open on screen right now.
 * Published by the agent overlay so other panels can make room for it: on a phone the line
 * panel folds to its pill while an answer is open (docs/PDD.md, "Screen space").
 */
let shown = false;
const subs = new Set<() => void>();

export function publishAnswerShown(next: boolean): void {
  if (next === shown) return;
  shown = next;
  subs.forEach((f) => f());
}

export function useAnswerShown(): boolean {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => shown, () => shown);
}
