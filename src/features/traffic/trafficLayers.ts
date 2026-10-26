import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { api } from "@/lib/api/client";

/**
 * Traffic speeds as a line layer under the labels: green / yellow / red by
 * speed relative to the link's free-flow speed (grey = no reading), offset to
 * the right of travel so the two directions of a road sit side by side.
 * DOT street closures (today) are dashed red. Refreshed every 5 minutes.
 */
const SRC = "traffic";

export function mount(map: MapLibreMap): () => void {
  if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const before = (map.getStyle().layers ?? []).find((l) => l.type === "symbol")?.id;
  const width = ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 3.5, 18, 6];
  const offset = ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 3, 18, 6];
  map.addLayer(
    {
      id: "traffic-closures",
      type: "line",
      source: SRC,
      minzoom: 12,
      filter: ["==", ["get", "kind"], "closure"],
      paint: { "line-color": "#dc2626", "line-width": 2.5, "line-dasharray": [2, 1.5], "line-opacity": 0.9 },
    },
    before,
  );
  map.addLayer(
    {
      id: "traffic-speeds",
      type: "line",
      source: SRC,
      filter: ["==", ["get", "kind"], "link"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "level"], "free", "#16a34a", "slow", "#f59e0b", "jam", "#dc2626", "#9ca3af"],
        "line-width": width as never,
        "line-offset": offset as never,
        "line-opacity": 0.9,
      },
    },
    before,
  );
  const load = async () => {
    try {
      const { data } = await api.GET("/api/traffic");
      if (data) void map.getSource<GeoJSONSource>(SRC)?.setData(data as unknown as Parameters<GeoJSONSource["setData"]>[0]);
    } catch {
      /* keep the last snapshot */
    }
  };
  void load();
  const timer = window.setInterval(() => void load(), 5 * 60_000);
  return () => {
    window.clearInterval(timer);
    for (const id of ["traffic-speeds", "traffic-closures"]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(SRC)) map.removeSource(SRC);
  };
}
