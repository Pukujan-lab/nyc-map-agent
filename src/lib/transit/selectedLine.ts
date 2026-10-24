import { useSyncExternalStore } from "react";

/**
 * The one subway line the person is looking at (agent-first home, #370):
 * picked by tapping a line or a train, or by choosing it in More layers.
 * The transit layer draws it (other lines dimmed, its station names and
 * trains as bullets) and its notices panel. `train` is the tapped train's
 * vehicle key, so "Follow a train" rides that one.
 */
export interface SelectedLine {
  route: string;
  train: string | null;
}

let selected: SelectedLine | null = null;
const subs = new Set<() => void>();

export function setSelectedLine(route: string | null, train: string | null = null): void {
  const next = route ? { route, train } : null;
  if (next?.route === selected?.route && next?.train === selected?.train) return;
  selected = next;
  subs.forEach((f) => f());
}

export const getSelectedLine = (): SelectedLine | null => selected;

export function useSelectedLine(): SelectedLine | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => selected, () => null);
}

/** A subway route as the map's features carry it ("6X" rides the 6's track and bullet). */
export const lineOf = (route: string): string => route.replace(/X$/, "");
