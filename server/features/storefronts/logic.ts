/**
 * Pure helpers for storefront brands and logos (unit-tested).
 */

/** Overpass QL: named brand POIs (shop / amenity) with brand:wikidata in a bbox. */
export function brandsQuery(b: { west: number; south: number; east: number; north: number }): string {
  const box = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:20];(nwr["brand:wikidata"]["shop"](${box});nwr["brand:wikidata"]["amenity"](${box}););out center tags 400;`;
}

/** Snap a bbox outward to a 0.005° grid so nearby requests share one cache entry. */
export function snapBbox(b: { west: number; south: number; east: number; north: number }, step = 0.005) {
  const f = (v: number) => Math.floor(v / step) * step;
  const c = (v: number) => Math.ceil(v / step) * step;
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return { west: r(f(b.west)), south: r(f(b.south)), east: r(c(b.east)), north: r(c(b.north)) };
}

export const QID = /^Q[1-9]\d{0,10}$/;

/** Commons licenses we re-host: public domain and the CC0 / CC BY / CC BY-SA family. */
export function licenseOk(short: string | undefined | null): boolean {
  if (!short) return false;
  const s = short.toLowerCase();
  if (/\bnc\b|\bnd\b|non-?commercial|no-?deriv|fair use|non-free/.test(s)) return false;
  return /public domain|^pd\b|pd-|cc0|cc[- ]by(-sa)?|cc by(-sa)?/.test(s);
}

/** Wikidata entity JSON → the first P154 (logo image) Commons file name, or null. */
export function logoFile(entity: unknown, qid: string): string | null {
  const e = (entity as { entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> }> })?.entities?.[qid];
  const v = e?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === "string" && v ? v : null;
}

/** Normalised name for matching OSM brand POIs to the tile signs: case, accents, punctuation. */
export function normName(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

/** The brand id of a sign: a brand POI with the same normalised name or brand within 60 m. Pure. */
export function matchBrand(s: { name: string; lon: number; lat: number }, brands: Array<{ name: string; brand: string | null; qid: string; lon: number; lat: number }>): string | null {
  const n = normName(s.name);
  if (!n) return null;
  const kx = 111_320 * Math.cos((s.lat * Math.PI) / 180);
  for (const b of brands) {
    if (normName(b.name) !== n && normName(b.brand ?? "") !== n) continue;
    if (Math.hypot((b.lon - s.lon) * kx, (b.lat - s.lat) * 111_320) <= 60) return b.qid;
  }
  return null;
}
