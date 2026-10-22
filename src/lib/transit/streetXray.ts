import { useSyncExternalStore } from "react";

/** Street-level X-ray: show underground trains as glowing cars through a see-through ground. Off by default. */
let on = false;
const subs = new Set<() => void>();
export function setStreetXray(value: boolean) {
  on = value;
  subs.forEach((f) => f());
}
export const getStreetXray = () => on;
export function useStreetXray(): boolean {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => on);
}
