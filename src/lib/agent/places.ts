import type { NtaBoundary } from "@/lib/api/nta";

export const BOROUGH_CENTERS: Record<
  string,
  { lat: number; lon: number; zoom: number }
> = {
  brooklyn: { lat: 40.6782, lon: -73.9442, zoom: 11.6 },
  manhattan: { lat: 40.7831, lon: -73.9712, zoom: 11.4 },
  queens: { lat: 40.7282, lon: -73.7949, zoom: 11 },
  bronx: { lat: 40.8448, lon: -73.8648, zoom: 11.4 },
  "staten island": { lat: 40.5795, lon: -74.1502, zoom: 11 },
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Loose neighborhood-name matching for `fly_to { place }`. */
export function findBoundary(
  boundaries: NtaBoundary[],
  place: string,
): NtaBoundary | null {
  const target = normalize(place);
  if (target.length < 4) return null;

  let best: NtaBoundary | null = null;
  let bestScore = 0;
  for (const boundary of boundaries) {
    const name = normalize(boundary.ntaName);
    if (name === target) return boundary;
    if (name.includes(target) || target.includes(name)) {
      const score = Math.min(name.length, target.length);
      if (score > bestScore) {
        best = boundary;
        bestScore = score;
      }
    }
  }
  return best;
}

export function findBoroughCenter(
  place: string,
): { lat: number; lon: number; zoom: number } | null {
  return BOROUGH_CENTERS[place.trim().toLowerCase()] ?? null;
}
