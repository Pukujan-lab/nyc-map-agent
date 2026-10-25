/**
 * Where the person is in the underground helper right now, for the agent and
 * the screen manager: riding toward a station, or at a station looking for an
 * exit. Kept in memory only, read when a question is sent, never stored.
 */
import { useSyncExternalStore } from "react";

export type UndergroundNow = { stage: "riding" | "at-station"; station: string; exit: string | null };

let now: UndergroundNow | null = null;
const subs = new Set<() => void>();

export function setUndergroundNow(next: UndergroundNow | null): void {
  if (JSON.stringify(next) === JSON.stringify(now)) return;
  now = next;
  subs.forEach((f) => f());
}

export function getUndergroundNow(): UndergroundNow | null {
  return now;
}

export function useUndergroundNow(): UndergroundNow | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, getUndergroundNow, getUndergroundNow);
}
