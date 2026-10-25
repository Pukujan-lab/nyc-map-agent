import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useFlag } from "@/lib/flags";
import { getMapInstance, onMapInstance } from "@/lib/map/mapInstance";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanel } from "@/lib/store/PanelContext";
import { useFollowed } from "@/lib/transit/follow";
import { useSelectedLine } from "@/lib/transit/selectedLine";
import { ContextOverrides, layersOf, planOps } from "./apply";
import { pickContext, setMapContext, useMapContextState, type MapContext } from "./context";

/** Sources that carry each drawn vehicle's key and route (the transit layer's own GeoJSON). */
const VEHICLE_SOURCES = ["transit-vehicles", "transit-vehicle-hits"];

/** Adapter: the followed vehicle's route, read off the features the map already draws. */
export function routeOnMap(map: Pick<MapLibreMap, "getSource" | "querySourceFeatures">, key: string): string | null {
  for (const src of VEHICLE_SOURCES) {
    if (!map.getSource(src)) continue;
    const f = map.querySourceFeatures(src, { filter: ["==", ["get", "key"], key] })[0];
    const p = f?.properties as { route?: unknown; label?: unknown } | undefined;
    const r = p?.route ?? p?.label;
    if (typeof r === "string" && r) return r;
  }
  return null;
}

/** Adapters: existing state (follow store, walking, open panel, chat) → the context store. */
function useContextAdapters(enabled: boolean): void {
  const followedKey = useFollowed();
  const { walking, chatOpen } = useMapState();
  const { content } = usePanel();
  const panelId = content?.id ?? null;
  const selectedLine = useSelectedLine()?.route ?? null;
  const [route, setRoute] = useState<{ key: string; route: string } | null>(null);

  // The follow store knows only the vehicle key; its route is on the map. Look until it is drawn.
  useEffect(() => {
    if (!enabled || !followedKey) return;
    let tries = 0;
    const look = () => {
      const map = getMapInstance();
      const r = map ? routeOnMap(map, followedKey) : null;
      if (r) setRoute({ key: followedKey, route: r });
      return !!r || ++tries > 20;
    };
    if (look()) return;
    const id = window.setInterval(() => { if (look()) window.clearInterval(id); }, 500);
    return () => window.clearInterval(id);
  }, [enabled, followedKey]);

  const followedRoute = route && route.key === followedKey ? route.route : null;
  useEffect(() => {
    setMapContext(enabled ? pickContext({ followedKey, followedRoute, walking, panelId, chatOpen, selectedLine }) : { kind: "browsing" });
  }, [enabled, followedKey, followedRoute, walking, panelId, chatOpen, selectedLine]);
}

const BROWSING: MapContext = { kind: "browsing" };

/**
 * Clean map by context (flag `contextClean`): while the user follows a train,
 * rides a trip, walks, views a place or asks the agent, layers that do not
 * matter for it are hidden or dimmed, and come back on exit.
 */
export function useContextClean(): void {
  const enabled = useFlag("contextClean");
  useContextAdapters(enabled);
  const { context, showAll } = useMapContextState();
  const target = useRef<MapContext>(BROWSING);
  const resync = useRef<() => void>(() => {});

  // One override set per map, kept across context changes so moving between contexts never flashes.
  useEffect(() => {
    if (!enabled) return;
    let cleanup = () => {};
    const off = onMapInstance((map) => {
      cleanup();
      cleanup = () => {};
      if (!map) return;
      const overrides = new ContextOverrides(map);
      let raf = 0;
      const sync = () => {
        raf = 0;
        if (map.style) overrides.sync(planOps(layersOf(map), target.current));
      };
      // Layers arrive late (lazy features) and React re-sets paint on prop changes: re-check on style changes.
      const schedule = () => { if (!raf) raf = requestAnimationFrame(sync); };
      resync.current = sync;
      sync();
      map.on("styledata", schedule);
      if (import.meta.env.DEV) Object.assign(window, { __contextClean: () => ({ context: target.current, overridden: overrides.size }) });
      cleanup = () => {
        map.off("styledata", schedule);
        if (raf) cancelAnimationFrame(raf);
        resync.current = () => {};
        if (map.style) overrides.restoreAll();
        overrides.dispose();
      };
    });
    return () => { off(); cleanup(); };
  }, [enabled]);

  useEffect(() => {
    target.current = enabled && !showAll ? context : BROWSING;
    resync.current();
  }, [enabled, context, showAll]);
}
