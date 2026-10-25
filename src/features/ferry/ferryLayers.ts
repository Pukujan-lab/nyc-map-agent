import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { z } from "zod";

/**
 * Ferry routes as water-blue dashed lines, terminals/piers as labelled dots,
 * and vessels (live from NYC Ferry GTFS-rt, else schedule estimates, drawn
 * hollow) refreshed every 30 s from /api/ferry.
 */
const SRC_ROUTES = "ferry-routes", SRC_TERMS = "ferry-terminals-src", SRC_VESSELS = "ferry-vessels-src";
const LAYERS = ["ferry-vessel-labels", "ferry-vessels", "ferry-terminal-labels", "ferry-terminals", "ferry-lines"];
export const WATER_BLUE = "#1D7FB8";

const data = z.object({
  routes: z.object({ type: z.literal("FeatureCollection"), features: z.array(z.unknown()) }),
  terminals: z.object({ type: z.literal("FeatureCollection"), features: z.array(z.unknown()) }),
  vessels: z.array(z.object({ id: z.string(), route: z.string(), lon: z.number(), lat: z.number(), heading: z.number().nullable(), source: z.enum(["live", "schedule"]) })),
});
type FerryData = z.infer<typeof data>;

export function vesselsGeo(v: FerryData["vessels"]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: v.map((x) => ({ type: "Feature", properties: { id: x.id, route: x.route, live: x.source === "live", label: `${x.route}${x.source === "live" ? "" : " (scheduled)"}` }, geometry: { type: "Point", coordinates: [x.lon, x.lat] } })) };
}

export function mount(map: MapLibreMap): () => void {
  const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  for (const id of [SRC_ROUTES, SRC_TERMS, SRC_VESSELS]) if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty });
  const add = (layer: Parameters<MapLibreMap["addLayer"]>[0]) => { if (!map.getLayer(layer.id)) map.addLayer(layer); };
  add({ id: "ferry-lines", type: "line", source: SRC_ROUTES, layout: { "line-cap": "round" }, paint: { "line-color": WATER_BLUE, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 15, 3.5], "line-dasharray": [2, 1.5], "line-opacity": 0.9 } });
  add({ id: "ferry-terminals", type: "circle", source: SRC_TERMS, paint: { "circle-color": "#ffffff", "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 6], "circle-stroke-color": WATER_BLUE, "circle-stroke-width": 2 } });
  add({ id: "ferry-terminal-labels", type: "symbol", source: SRC_TERMS, minzoom: 11.5, layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true }, paint: { "text-color": "#0b4f75", "text-halo-color": "#ffffff", "text-halo-width": 2 } });
  add({ id: "ferry-vessels", type: "circle", source: SRC_VESSELS, paint: { "circle-color": ["case", ["get", "live"], WATER_BLUE, "#ffffff"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 8], "circle-stroke-color": WATER_BLUE, "circle-stroke-width": 2 } });
  add({ id: "ferry-vessel-labels", type: "symbol", source: SRC_VESSELS, minzoom: 12, layout: { "text-field": ["get", "label"], "text-size": 10, "text-offset": [0, -1.3], "text-optional": true }, paint: { "text-color": "#0b4f75", "text-halo-color": "#ffffff", "text-halo-width": 2 } });

  const load = async () => {
    try {
      const res = await fetch("/api/ferry");
      if (!res.ok) return;
      const d = data.parse(await res.json());
      map.getSource<GeoJSONSource>(SRC_ROUTES)?.setData(d.routes as GeoJSON.FeatureCollection);
      map.getSource<GeoJSONSource>(SRC_TERMS)?.setData(d.terminals as GeoJSON.FeatureCollection);
      map.getSource<GeoJSONSource>(SRC_VESSELS)?.setData(vesselsGeo(d.vessels));
    } catch {
      /* best-effort layer */
    }
  };
  void load();
  const timer = window.setInterval(() => void load(), 30_000);
  return () => {
    window.clearInterval(timer);
    for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of [SRC_ROUTES, SRC_TERMS, SRC_VESSELS]) if (map.getSource(id)) map.removeSource(id);
  };
}
