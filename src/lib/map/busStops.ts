import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Basemap bus-stop icons live on the style's poi_transit layer (class "bus").
 * Shown: icons from zoom 15, names from zoom 17. Hidden: nothing at any zoom.
 * Subway and rail icons on that same layer stay.
 */
/**
 * The basemap bus-stop icon under a tap (8 px slop), or undefined. MapView uses
 * it to skip its own picks; the transit feature uses it to open the stop.
 */
export function busStopAt(map: MapLibreMap, point: { x: number; y: number }): { name: string } | undefined {
  if (!map.getLayer("poi_transit")) return undefined;
  const hit = map
    .queryRenderedFeatures([[point.x - 8, point.y - 8], [point.x + 8, point.y + 8]], { layers: ["poi_transit"] })
    .find((f) => f.properties?.class === "bus");
  if (!hit) return undefined;
  const name: unknown = hit.properties?.name;
  return { name: typeof name === "string" && name ? name : "Bus stop" };
}

export function busStopIconOpacity(show: boolean): number | unknown[] {
  if (!show) return 0;
  return ["step", ["zoom"], ["case", ["==", ["get", "class"], "bus"], 0, 1], 15, 1];
}

export function busStopTextOpacity(show: boolean): number | unknown[] {
  if (!show) return 0;
  return ["step", ["zoom"], ["case", ["==", ["get", "class"], "bus"], 0, 1], 17, 1];
}
