import { useSyncExternalStore } from "react";

/**
 * Global X-ray: underground subway trains glow below a semi-transparent ground
 * and buildings, at every level (Street, Mid, Up, Top). Off by default; riding
 * an underground train turns it on.
 */
let on = false;
const subs = new Set<() => void>();
export function setStreetXray(value: boolean) {
  if (on === value) return;
  on = value;
  subs.forEach((f) => f());
}
export const getStreetXray = () => on;
export function useStreetXray(): boolean {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => on);
}
