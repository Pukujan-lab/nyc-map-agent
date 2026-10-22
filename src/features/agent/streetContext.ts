import { useSyncExternalStore } from "react";
import type { StaticSystem } from "@/features/transit/model";
import type { AskContext } from "./schema";

/** Latest loaded subway static data, published by the transit layer so street view can name the nearest station. */
let subway: StaticSystem | null = null;
export function publishSubway(sys: StaticSystem | null) {
  subway = sys;
}

const metres = (a: [number, number], b: [number, number]) => {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111_320);
};

/** Nearest station (within 1.5 km) and its nearest entrance. Pure, for tests. */
export function nearestStop(sys: StaticSystem | null, lon: number, lat: number): { station: string | null; entrance: string | null } {
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

export function buildStreetContext(p: { lon: number; lat: number; heading: number | null; followedTrain: string | null }, sys: StaticSystem | null = subway): AskContext {
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
