import { useSyncExternalStore } from "react";

/** A drawn live vehicle, as the mini map needs it. */
export type LiveDot = { key: string; lon: number; lat: number; color: string; bus: boolean; underground: boolean; /** Route short name: "G", "B62". */ label?: string };

/** Live vehicle positions the map layer publishes (~1 Hz) for other views such as the street mini map. */
let dots: LiveDot[] = [];
const subs = new Set<() => void>();
export function publishLiveDots(next: LiveDot[]) {
  dots = next;
  subs.forEach((f) => f());
}
export function useLiveDots(): LiveDot[] {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => dots);
}
/** Dots within `radiusM` of a point, as GeoJSON for a circle layer. */
export function dotsNear(list: LiveDot[], lon: number, lat: number, radiusM: number): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180), ky = 111_320;
  return {
    type: "FeatureCollection",
    features: list
      .filter((d) => Math.hypot((d.lon - lon) * kx, (d.lat - lat) * ky) <= radiusM)
      .map((d) => ({ type: "Feature", properties: { color: d.color, bus: d.bus, under: d.underground, label: d.label ?? "" }, geometry: { type: "Point", coordinates: [d.lon, d.lat] } })),
  };
}
