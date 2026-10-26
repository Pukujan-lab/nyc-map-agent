import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { LngLatTuple } from "./schema";

/**
 * A "which exit" answer on the map: the walk from the exit to the place
 * (dashed), the exit as a marker with its corner label, the place as a small
 * dot, and your dot with an arrow for the way the phone faces. The map stays
 * north up; only the arrow turns (icon-rotation-alignment "map").
 */
const SRC = "agent-exit";
const YOU = "agent-you";
const BEAM = "agent-you-beam";

export interface ExitView {
  exit: { at: LngLatTuple; label: string };
  destination: { at: LngLatTuple; label: string };
  path: LngLatTuple[];
}

export function exitToGeoJson(v: ExitView): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { kind: "path" }, geometry: { type: "LineString", coordinates: v.path } },
      { type: "Feature", properties: { kind: "dest", name: v.destination.label }, geometry: { type: "Point", coordinates: v.destination.at } },
      { type: "Feature", properties: { kind: "exit", name: v.exit.label }, geometry: { type: "Point", coordinates: v.exit.at } },
    ],
  };
}

/** A soft wedge pointing up (north before rotation): the way the phone faces. */
function beamImage(): ImageData | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!c) return null;
  c.canvas.width = c.canvas.height = 96;
  const g = c.createRadialGradient(48, 48, 6, 48, 48, 46);
  g.addColorStop(0, "rgba(37,99,235,0.85)");
  g.addColorStop(1, "rgba(37,99,235,0)");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(48, 48);
  c.arc(48, 48, 46, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
  c.closePath();
  c.fill();
  return c.getImageData(0, 0, 96, 96);
}

function ensure(map: MapLibreMap): void {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource(YOU, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const beam = beamImage();
  if (beam && !map.hasImage(BEAM)) map.addImage(BEAM, beam, { pixelRatio: 2 });
  map.addLayer({ id: "agent-exit-path", type: "line", source: SRC, filter: ["==", ["get", "kind"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#16a34a", "line-width": 5, "line-dasharray": [1, 1.4] } });
  map.addLayer({ id: "agent-exit-dest", type: "circle", source: SRC, filter: ["==", ["get", "kind"], "dest"], paint: { "circle-radius": 6, "circle-color": "#111827", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
  map.addLayer({ id: "agent-exit-dot", type: "circle", source: SRC, filter: ["==", ["get", "kind"], "exit"], paint: { "circle-radius": 10, "circle-color": "#16a34a", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
  map.addLayer({
    id: "agent-exit-label", type: "symbol", source: SRC, filter: ["!=", ["get", "kind"], "path"],
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": ["match", ["get", "kind"], "exit", 13, 11], "text-anchor": "top", "text-offset": [0, 1.1], "text-max-width": 12, "text-allow-overlap": true },
    paint: { "text-color": "#052e16", "text-halo-color": "#ffffff", "text-halo-width": 2 },
  });
  map.addLayer({ id: "agent-you-beam", type: "symbol", source: YOU, filter: ["has", "heading"], layout: { "icon-image": BEAM, "icon-rotate": ["get", "heading"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true } });
  map.addLayer({ id: "agent-you", type: "circle", source: YOU, paint: { "circle-radius": 8, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
}

/** Draw the exit, its walk and the place; replaces the previous exit answer. */
export function showExit(map: MapLibreMap, v: ExitView): void {
  ensure(map);
  (map.getSource(SRC) as GeoJSONSource).setData(exitToGeoJson(v));
}

/** Your dot, with the heading wedge when the heading is known. */
export function setYou(map: MapLibreMap, at: LngLatTuple | null, heading: number | null): void {
  if (!map.getSource(YOU)) {
    if (!at) return;
    ensure(map);
  }
  (map.getSource(YOU) as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: at ? [{ type: "Feature", properties: heading === null ? {} : { heading }, geometry: { type: "Point", coordinates: at } }] : [],
  });
}

export function clearExit(map: MapLibreMap): void {
  for (const id of [SRC, YOU]) {
    const s = map.getSource(id);
    if (s) (s as GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
  }
}

/** Bounds of the exit, its walk and (when shared) you. */
export function exitBounds(v: ExitView, you: LngLatTuple | null): [[number, number], [number, number]] {
  const all = [...v.path, v.exit.at, v.destination.at, ...(you ? [you] : [])];
  const lons = all.map((c) => c[0]);
  const lats = all.map((c) => c[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}
