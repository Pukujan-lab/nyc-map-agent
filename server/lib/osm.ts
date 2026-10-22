/**
 * Shared Overpass helpers. Features must not import each other, and both
 * storefront logos and street art snap a bbox and accept the same Commons licences.
 */

/** Snap a bbox outward to a grid so nearby requests share one cache entry. */
export function snapBbox(b: { west: number; south: number; east: number; north: number }, step = 0.005) {
  const f = (v: number) => Math.floor(v / step) * step;
  const c = (v: number) => Math.ceil(v / step) * step;
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return { west: r(f(b.west)), south: r(f(b.south)), east: r(c(b.east)), north: r(c(b.north)) };
}

/** Commons licenses we re-host: public domain and the CC0 / CC BY / CC BY-SA family. */
export function licenseOk(short: string | undefined | null): boolean {
  if (!short) return false;
  const s = short.toLowerCase();
  if (/\bnc\b|\bnd\b|non-?commercial|no-?deriv|fair use|non-free/.test(s)) return false;
  return /public domain|^pd\b|pd-|cc0|cc[- ]by(-sa)?|cc by(-sa)?/.test(s);
}
