/**
 * The "W 44 St at 8 Av" location card while walking: the nearest baked corner
 * sign (city tiles, `signs` layer) names the intersection. Pure, no three.js,
 * so it stays in the main chunk without pulling in the sign renderer.
 */
export interface CornerSign {
  lng: number;
  lat: number;
  a: string;
  b: string;
}

/** "W 44 ST" → "W 44 St"; directions and ordinals keep their sign casing. */
export function titleStreet(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^[nsew]$/.test(w) ? w.toUpperCase() : /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

const AVENUE = /\b(av|ave|avenue|blvd|broadway)$/i;

/** Street first, avenue second, as New Yorkers say it: "W 44 St at 8 Av". */
export function cornerLabel(a: string, b: string): string {
  const [x, y] = AVENUE.test(a) && !AVENUE.test(b) ? [b, a] : [a, b];
  return `${titleStreet(x)} at ${titleStreet(y)}`;
}

/** Nearest sign within `maxM` metres of the point, as a label, or null. */
export function nearestCorner(signs: CornerSign[], lng: number, lat: number, maxM = 120): string | null {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  let best: CornerSign | null = null;
  let bestD = maxM;
  for (const s of signs) {
    const d = Math.hypot((s.lng - lng) * kx, (s.lat - lat) * 111_320);
    if (d <= bestD) {
      bestD = d;
      best = s;
    }
  }
  return best ? cornerLabel(best.a, best.b) : null;
}

/** 1 near the camera, fading to 0 between `near` and `far` metres. */
export function distanceFade(d: number, near = 60, far = 260): number {
  if (d <= near) return 1;
  if (d >= far) return 0;
  return 1 - (d - near) / (far - near);
}
