/**
 * Hero landmarks drawn as glTF models instead of plain footprint boxes.
 * Shared by the tile build (footprints within `radiusM` get `hero: 1` and are
 * not extruded) and the three.js landmarks layer (models in
 * public/models/landmarks, made by scripts/make-landmarks.mjs, CC0).
 */
export interface Landmark {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** Model +y turned to this bearing (degrees from north); the Manhattan grid is ~29°. */
  bearing: number;
  /** Footprints whose centre is this close are replaced by the model. */
  radiusM: number;
}

export const LANDMARKS: Landmark[] = [
  { id: "empire-state", name: "Empire State Building", lon: -73.98566, lat: 40.74844, bearing: 29, radiusM: 45 },
  { id: "chrysler", name: "Chrysler Building", lon: -73.97545, lat: 40.75162, bearing: 29, radiusM: 30 },
  { id: "one-wtc", name: "One World Trade Center", lon: -74.01338, lat: 40.71299, bearing: 29, radiusM: 40 },
  { id: "liberty", name: "Statue of Liberty", lon: -74.04452, lat: 40.68925, bearing: 135, radiusM: 30 },
];

/** The landmark whose footprint radius holds (lon, lat), if any. */
export function landmarkAt(lon: number, lat: number): Landmark | undefined {
  return LANDMARKS.find((l) => {
    const dx = (lon - l.lon) * 111_320 * Math.cos((l.lat * Math.PI) / 180);
    const dy = (lat - l.lat) * 111_320;
    return Math.hypot(dx, dy) <= l.radiusM;
  });
}
