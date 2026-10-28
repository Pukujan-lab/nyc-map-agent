import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { LngLatTuple } from "./schema";

/**
 * A "which exit" answer on the map: the walk from the exit to the place
 * (dashed), the exit as a marker with its corner label and the place as a
 * small dot. Your own marker is drawn by YouMarker, as on every screen.
 */
const SRC = "agent-exit";

export interface ExitView {
  exit: { at: LngLatTuple; label: string };
  destination: { at: LngLatTuple; label: string };
  path: LngLatTuple[];
}

export function exitToGeoJson(v: ExitView): GeoJSON.FeatureCollection {
  // Each label grows toward the other point, so neither runs off the screen edge or under the map buttons.
  const exitWest = v.exit.at[0] <= v.destination.at[0];
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { kind: "path" }, geometry: { type: "LineString", coordinates: v.path } },
      { type: "Feature", properties: { kind: "dest", name: v.destination.label, anchor: exitWest ? "top-right" : "top-left" }, geometry: { type: "Point", coordinates: v.destination.at } },
      { type: "Feature", properties: { kind: "exit", name: v.exit.label, anchor: exitWest ? "top-left" : "top-right" }, geometry: { type: "Point", coordinates: v.exit.at } },
    ],
  };
}

function ensure(map: MapLibreMap): void {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "agent-exit-path", type: "line", source: SRC, filter: ["==", ["get", "kind"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#16a34a", "line-width": 5, "line-dasharray": [1, 1.4] } });
  map.addLayer({ id: "agent-exit-dest", type: "circle", source: SRC, filter: ["==", ["get", "kind"], "dest"], paint: { "circle-radius": 6, "circle-color": "#111827", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
  map.addLayer({ id: "agent-exit-dot", type: "circle", source: SRC, filter: ["==", ["get", "kind"], "exit"], paint: { "circle-radius": 10, "circle-color": "#16a34a", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
  map.addLayer({
    id: "agent-exit-label", type: "symbol", source: SRC, filter: ["!=", ["get", "kind"], "path"],
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": ["match", ["get", "kind"], "exit", 13, 11], "text-anchor": ["get", "anchor"], "text-offset": [0, 1.1], "text-justify": "auto", "text-max-width": 12, "text-allow-overlap": true },
    paint: { "text-color": "#052e16", "text-halo-color": "#ffffff", "text-halo-width": 2 },
  });
}

/** Draw the exit, its walk and the place; replaces the previous exit answer. */
export function showExit(map: MapLibreMap, v: ExitView): void {
  ensure(map);
  void (map.getSource(SRC) as GeoJSONSource).setData(exitToGeoJson(v));
}

export function clearExit(map: MapLibreMap): void {
  const s = map.getSource(SRC);
  if (s) void (s as GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
}

/** Bounds of the exit, its walk and (when shared) you. */
export function exitBounds(v: ExitView, you: LngLatTuple | null): [[number, number], [number, number]] {
  const all = [...v.path, v.exit.at, v.destination.at, ...(you ? [you] : [])];
  const lons = all.map((c) => c[0]);
  const lats = all.map((c) => c[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}
