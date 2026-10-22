/**
 * Whether shop & café toilets are showing: Restrooms on AND the "Include shops
 * & cafés" chip on. Written by the overlay (React state), read by the map layer.
 */
let enabled = false;
const listeners = new Set<(on: boolean) => void>();

export const SHOPS_CHIP = "restroomShops";

export function isShopsEnabled(): boolean {
  return enabled;
}

export function setShopsEnabled(on: boolean): void {
  if (on === enabled) return;
  enabled = on;
  for (const l of listeners) l(on);
}

export function subscribeShops(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
