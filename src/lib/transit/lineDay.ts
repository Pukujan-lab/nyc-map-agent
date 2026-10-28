import { useSyncExternalStore } from "react";
import type { LineDay } from "./weekend";

export { weekendWindow, type LineDay } from "./weekend";

/**
 * The time the line panel shows planned work for (owner, 2026-10-27: the 7's weekend work was
 * invisible on a weekday). null = right now. Set by the panel's day chips or by an answer about
 * "this weekend"; cleared when the line closes.
 */
let day: LineDay | null = null;
const subs = new Set<() => void>();

export function setLineDay(next: LineDay | null): void {
  if (next?.from === day?.from && next?.to === day?.to && next?.label === day?.label) return;
  day = next;
  subs.forEach((f) => f());
}
export const getLineDay = (): LineDay | null => day;
export function useLineDay(): LineDay | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => day, () => null);
}
