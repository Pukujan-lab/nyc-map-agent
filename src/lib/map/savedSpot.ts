/** A home or work pin. Kept inside the New York metro so a bad save cannot fly the map away. */
export interface SavedSpot {
  label: string;
  lon: number;
  lat: number;
}

export const SAVED_LON_MIN = -74.4;
export const SAVED_LON_MAX = -73.5;
export const SAVED_LAT_MIN = 40.4;
export const SAVED_LAT_MAX = 41.05;

export function asSavedSpot(raw: unknown): SavedSpot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { label?: unknown; lon?: unknown; lat?: unknown };
  if (typeof r.label !== "string" || typeof r.lon !== "number" || typeof r.lat !== "number") return null;
  const label = r.label.trim().slice(0, 80);
  if (!label) return null;
  if (r.lon < SAVED_LON_MIN || r.lon > SAVED_LON_MAX || r.lat < SAVED_LAT_MIN || r.lat > SAVED_LAT_MAX) return null;
  return { label, lon: r.lon, lat: r.lat };
}
