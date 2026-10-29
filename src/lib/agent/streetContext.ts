import { useSyncExternalStore } from "react";
import { walkEye } from "@/lib/map/walkEye";
import { followedTrain } from "@/lib/transit/follow";

/** The slice of the transit static data this needs (StationData satisfies it). */
export interface StationData {
  stations: { features: Array<{ geometry: { coordinates: number[] }; properties: { id: string; name: string } }> };
  entrances?: { features: Array<{ geometry: { coordinates: number[] }; properties: { id: string; name: string; kind: string } }> };
}

/** Same shape as `askContext` in src/features/agent/schema.ts (the tests check the two agree). */
export interface AskContext {
  source: "street-view";
  lon: number;
  lat: number;
  heading: number | null;
  nearestStation: string | null;
  nearestEntrance: string | null;
  followedTrain: string | null;
}

/** Latest loaded subway static data, published by the transit layer so street view can name the nearest station. */
let subway: StationData | null = null;
export function publishSubway(sys: StationData | null) {
  subway = sys;
}

const metres = (a: [number, number], b: [number, number]) => {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111_320);
};

/** Nearest station (within 1.5 km) and its nearest entrance. Pure, for tests. */
export function nearestStop(sys: StationData | null, lon: number, lat: number): { station: string | null; entrance: string | null } {
  if (!sys) return { station: null, entrance: null };
  const here: [number, number] = [lon, lat];
  let best: { id: string; name: string; d: number } | null = null;
  for (const f of sys.stations.features) {
    const d = metres(here, f.geometry.coordinates as [number, number]);
    if (d <= 1500 && (!best || d < best.d)) best = { id: String(f.properties.id), name: f.properties.name, d };
  }
  if (!best) return { station: null, entrance: null };
  let ent: { name: string; d: number } | null = null;
  for (const f of sys.entrances?.features ?? []) {
    if (String(f.properties.id) !== best.id) continue;
    const d = metres(here, f.geometry.coordinates as [number, number]);
    if (!ent || d < ent.d) ent = { name: `${f.properties.kind} at ${f.properties.name}`.trim(), d };
  }
  return { station: `${best.name} (${Math.round(best.d)} m)`, entrance: ent ? `${ent.name} (${Math.round(ent.d)} m)` : null };
}

export function buildStreetContext(p: { lon: number; lat: number; heading: number | null; followedTrain: string | null }, sys: StationData | null = subway): AskContext {
  const near = nearestStop(sys, p.lon, p.lat);
  return {
    source: "street-view",
    lon: p.lon,
    lat: p.lat,
    heading: p.heading === null ? null : Math.round(((p.heading % 360) + 360) % 360),
    nearestStation: near.station,
    nearestEntrance: near.entrance,
    followedTrain: p.followedTrain,
  };
}

/** "Open Ask from street view" requests. The overlay shows a compact, non-modal sheet while one is set. */
let request: { context: AskContext; nonce: number } | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export function openAsk(context: AskContext) {
  request = { context, nonce: Date.now() };
  emit();
}
export function closeAsk() {
  request = null;
  emit();
}
export function useAskRequest() {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => request);
}

/** Street view's spot as the question's "here", or null when not in street view. */
export function streetContextHere(heading: number | null): AskContext | null {
  const eye = walkEye();
  return eye ? buildStreetContext({ lon: eye.lon, lat: eye.lat, heading, followedTrain: followedTrain() }) : null;
}
