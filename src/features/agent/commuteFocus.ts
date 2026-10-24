import { useSyncExternalStore } from "react";

/** A tap on a delay in My day asks the home's commute notice to open. */
export interface CommuteFocus {
  route: string;
  /** Bumped so the same line can be opened again. */
  n: number;
}

let focus: CommuteFocus | null = null;
const subs = new Set<() => void>();

export function openCommuteNotice(route: string): void {
  focus = { route, n: Date.now() };
  subs.forEach((f) => f());
}

export function useCommuteFocus(): CommuteFocus | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => focus, () => null);
}
