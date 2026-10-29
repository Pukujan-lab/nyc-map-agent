import { useSyncExternalStore } from "react";

/**
 * How many pull sheets are up from behind the chat. MapChrome reads it to keep
 * the quick buttons beside a sheet without loading the screen machine at boot.
 */
let count = 0;
const subs = new Set<() => void>();

export function pullSheetMounted(): () => void {
  count += 1;
  subs.forEach((f) => f());
  return () => {
    count -= 1;
    subs.forEach((f) => f());
  };
}

export function usePullSheetUp(): boolean {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => count > 0, () => false);
}
