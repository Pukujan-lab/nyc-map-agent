import { useEffect, useSyncExternalStore } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * "See through buildings": an opt-in street-level look where buildings fade
 * when you look up past the horizon, so the sky and the line of the street
 * stay clear. Off by default (buildings stay solid). The fade uses MapLibre's
 * own paint transition, so it never pops. The choice is kept in localStorage.
 */
const KEY = "nma.seeThrough";
const FADED = 0.15;
/** Pitch past which you are looking up (90° is level). */
const LOOK_UP = 95;

let on = typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
const subs = new Set<() => void>();
export function setSeeThrough(v: boolean) {
  on = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ }
  subs.forEach((f) => f());
}
export function useSeeThrough(): boolean {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => on);
}

/** Fades buildings while walking, looking up, with the option on; restores them otherwise. */
export function useSeeThroughBuildings(map: MaplibreMap | undefined, walking: boolean) {
  const enabled = useSeeThrough();
  useEffect(() => {
    if (!map) return;
    const saved = new Map<string, unknown>();
    const ids = () => (map.getStyle()?.layers ?? []).filter((l) => l.type === "fill-extrusion" && !l.id.startsWith("transit-")).map((l) => l.id);
    const apply = () => {
      const fade = walking && enabled && map.getPitch() > LOOK_UP;
      for (const id of ids()) {
        if (fade && !saved.has(id)) {
          saved.set(id, map.getPaintProperty(id, "fill-extrusion-opacity") ?? 1);
          map.setPaintProperty(id, "fill-extrusion-opacity-transition", { duration: 700, delay: 0 });
          map.setPaintProperty(id, "fill-extrusion-opacity", FADED);
        } else if (!fade && saved.has(id)) {
          map.setPaintProperty(id, "fill-extrusion-opacity", saved.get(id));
          saved.delete(id);
        }
      }
    };
    apply();
    map.on("pitchend", apply);
    map.on("moveend", apply);
    return () => {
      map.off("pitchend", apply);
      map.off("moveend", apply);
      for (const [id, v] of saved) if (map.getLayer(id)) map.setPaintProperty(id, "fill-extrusion-opacity", v);
    };
  }, [map, walking, enabled]);
}
