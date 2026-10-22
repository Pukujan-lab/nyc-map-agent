/**
 * Street art (OSM tourism=artwork, artwork_type mural / graffiti): pure helpers
 * for the Overpass query, the license check and snapping each piece onto the
 * nearest building wall as a thin slab that MapLibre extrudes and paints.
 */
export type Bbox = { west: number; south: number; east: number; north: number };

/** Artworks in the bbox, then the buildings within 25 m of them, with geometry. */
export function artQuery(b: Bbox): string {
  const box = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:25];nwr["tourism"="artwork"]["artwork_type"~"^(mural|graffiti)$"](${box})->.a;.a out center tags;way(around.a:25)["building"];out geom;`;
}

/** A Commons file name from OSM wikimedia_commons / image tags, or null (non-Commons images are not license-checked, so not used). */
export function commonsFile(tags: Record<string, string>): string | null {
  const wc = tags.wikimedia_commons ?? "";
  if (/^File:/i.test(wc)) return wc.replace(/^File:/i, "");
  const img = tags.image ?? "";
  const m = img.match(/commons\.wikimedia\.org\/wiki\/File:([^?#]+)/i) ?? img.match(/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : null;
}

type P = [number, number];

/**
 * The wall slab for an artwork at `pt`: the nearest building edge within
 * `maxM` metres, a rectangle up to `widthM` long centred on the point's
 * projection, 0.25 m deep and pushed 0.05 m out from the wall (away from the
 * building's centre). Returns the ring (lon, lat) or null. Pure.
 */
export function wallSlab(pt: P, buildings: P[][], maxM = 25, widthM = 8): P[] | null {
  const kx = 111_320 * Math.cos((pt[1] * Math.PI) / 180), ky = 111_320;
  const toM = (p: P): P => [(p[0] - pt[0]) * kx, (p[1] - pt[1]) * ky];
  const toLL = (m: P): P => [pt[0] + m[0] / kx, pt[1] + m[1] / ky];
  let best: { d: number; a: P; b: P; q: P; c: P } | null = null;
  for (const ring of buildings) {
    if (ring.length < 3) continue;
    const r = ring.map(toM);
    const c: P = [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
    for (let i = 0; i + 1 < r.length; i++) {
      const a = r[i], b = r[i + 1];
      const vx = b[0] - a[0], vy = b[1] - a[1], len2 = vx * vx + vy * vy;
      if (len2 < 1) continue;
      const t = Math.max(0, Math.min(1, -(a[0] * vx + a[1] * vy) / len2));
      const q: P = [a[0] + t * vx, a[1] + t * vy];
      const d = Math.hypot(q[0], q[1]);
      if (d <= maxM && (!best || d < best.d)) best = { d, a, b, q, c };
    }
  }
  if (!best) return null;
  const { a, b, q, c } = best;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len;
  let nx = -ty, ny = tx;
  if ((q[0] - c[0]) * nx + (q[1] - c[1]) * ny < 0) { nx = -nx; ny = -ny; }
  // Keep the slab on the edge: centre clamped so it does not overhang the corner.
  const w = Math.min(widthM, len);
  const along = (q[0] - a[0]) * tx + (q[1] - a[1]) * ty;
  const mid = Math.max(w / 2, Math.min(len - w / 2, along));
  const m: P = [a[0] + tx * mid, a[1] + ty * mid];
  const o = (s: number, n: number): P => [m[0] + tx * s + nx * n, m[1] + ty * s + ny * n];
  const ring = [o(-w / 2, 0.05), o(w / 2, 0.05), o(w / 2, 0.3), o(-w / 2, 0.3)];
  return [...ring, ring[0]].map(toLL);
}
