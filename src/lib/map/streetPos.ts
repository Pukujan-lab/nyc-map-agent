/**
 * "Grand St & Essex St": the street you stand on and the nearest cross street,
 * from the basemap's named OSM street centrelines (`transportation_name`).
 * Pure, no three.js, so it stays in the main chunk.
 */
import { titleStreet } from "./corner";

export interface NamedLine {
  name: string;
  coords: Array<[number, number]>;
}

const M = 111_320;

/** Distance in metres from p to segment ab, in a local equirectangular frame. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Shortened sign form: "Grand Street" → "Grand St", "Essex Avenue" → "Essex Av". */
export function shortStreet(name: string): string {
  const s = name
    .replace(/\bStreet\b/gi, "St")
    .replace(/\bAvenue\b/gi, "Av")
    .replace(/\bBoulevard\b/gi, "Blvd")
    .replace(/\bPlace\b/gi, "Pl")
    .replace(/\bRoad\b/gi, "Rd")
    .replace(/\bDrive\b/gi, "Dr")
    .replace(/\bEast\b(?=\s+\d)/g, "E")
    .replace(/\bWest\b(?=\s+\d)/g, "W")
    .trim();
  return /[a-z]/.test(s) ? s : titleStreet(s);
}

/**
 * The nearest named segment, plus the nearest *other* named street whose
 * line passes within `crossM` metres (≈ the next intersection along the way).
 */
export function streetPosition(
  lines: NamedLine[],
  lng: number,
  lat: number,
  maxM = 60,
  crossM = 80,
): { street: string; cross: string | null } | null {
  const kx = M * Math.cos((lat * Math.PI) / 180);
  const best = new Map<string, number>();
  for (const l of lines) {
    if (!l.name) continue;
    let d = Infinity;
    for (let i = 1; i < l.coords.length; i++) {
      const [ax, ay] = l.coords[i - 1];
      const [bx, by] = l.coords[i];
      d = Math.min(d, segDist(lng * kx, lat * M, ax * kx, ay * M, bx * kx, by * M));
    }
    if (d < (best.get(l.name) ?? Infinity)) best.set(l.name, d);
  }
  const ranked = [...best].sort((a, b) => a[1] - b[1]);
  if (!ranked.length || ranked[0][1] > maxM) return null;
  const street = ranked[0][0];
  const cross = ranked.find(([n, d]) => n !== street && d <= crossM)?.[0] ?? null;
  return { street: shortStreet(street), cross: cross ? shortStreet(cross) : null };
}

/** "Grand St & Essex St" or just "Grand St". */
export function streetLabel(p: { street: string; cross: string | null } | null): string | null {
  if (!p) return null;
  return p.cross ? `${p.street} & ${p.cross}` : p.street;
}
