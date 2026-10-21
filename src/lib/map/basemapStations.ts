import type { Map as MaplibreMap } from "maplibre-gl";

type Layer = { id: string; type: string; "source-layer"?: string; filter?: unknown };
/** The basemap's own station labels (OpenMapTiles poi: rail/railway/subway). */
const BASEMAP_STATION = ["any",
  ["match", ["get", "class"], ["rail", "railway"], true, false],
  ["match", ["get", "subclass"], ["subway", "station", "halt", "tram_stop"], true, false],
];
/** Only the basemap's transit poi layer: the ranked poi_r* layers belong to Places (places.ts owns their filters). */
export const isBasemapPoiLayer = (l: Layer) => l.type === "symbol" && l["source-layer"] === "poi" && /^poi_transit/.test(l.id);

const saved = new WeakMap<MaplibreMap, Map<string, unknown>>();
/** Hides (or restores) the basemap's duplicate station labels by narrowing each poi layer's filter. */
export function hideBasemapStations(map: MaplibreMap, hide: boolean): void {
  let store = saved.get(map);
  if (!store) { store = new Map(); saved.set(map, store); }
  for (const l of (map.getStyle()?.layers ?? []) as Layer[]) {
    if (!isBasemapPoiLayer(l)) continue;
    if (hide) {
      if (!store.has(l.id)) store.set(l.id, map.getFilter(l.id) ?? null);
      const orig = store.get(l.id);
      map.setFilter(l.id, (orig ? ["all", orig, ["!", BASEMAP_STATION]] : ["!", BASEMAP_STATION]) as never);
    } else if (store.has(l.id)) {
      map.setFilter(l.id, store.get(l.id) as never);
      store.delete(l.id);
    }
  }
}
