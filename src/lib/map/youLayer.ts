import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

/**
 * Your marker on the map, drawn in one place for every screen: a blue dot, a
 * soft cone for the way you face, and a faint circle as wide as the position
 * is uncertain (it grows below ground, where GPS is weak). Kept above every
 * other layer.
 */
const SRC = "you";
export const YOU_LAYERS = ["you-accuracy", "you-beam", "you-dot"] as const;
const BEAM = "you-beam";

/** A soft wedge pointing up (north before rotation): the way the phone faces. */
function beamImage(): ImageData | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!c) return null;
  c.canvas.width = c.canvas.height = 120;
  const g = c.createRadialGradient(60, 60, 6, 60, 60, 58);
  g.addColorStop(0, "rgba(37,99,235,0.8)");
  g.addColorStop(1, "rgba(37,99,235,0)");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(60, 60);
  c.arc(60, 60, 58, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
  c.closePath();
  c.fill();
  return c.getImageData(0, 0, 120, 120);
}

/** Pixels per metre at zoom 22 at this latitude (MapLibre's 512 px tiles). */
function pxPerMetreZ22(lat: number): number {
  return (512 * 2 ** 22) / (40_075_016.686 * Math.cos((lat * Math.PI) / 180));
}

export function installYouLayer(map: MapLibreMap): void {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const beam = beamImage();
  if (beam && !map.hasImage(BEAM)) map.addImage(BEAM, beam, { pixelRatio: 2 });
  map.addLayer({ id: "you-accuracy", type: "circle", source: SRC, paint: { "circle-radius": 0, "circle-color": "#3b82f6", "circle-opacity": 0.12, "circle-stroke-color": "#3b82f6", "circle-stroke-opacity": 0.35, "circle-stroke-width": 1, "circle-pitch-alignment": "map" } });
  map.addLayer({ id: "you-beam", type: "symbol", source: SRC, filter: ["has", "heading"], layout: { "icon-image": BEAM, "icon-rotate": ["get", "heading"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true } });
  map.addLayer({ id: "you-dot", type: "circle", source: SRC, paint: { "circle-radius": 8, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3, "circle-pitch-alignment": "map" } });
}

/** Keep the marker on top of layers other features added after it. */
export function raiseYouLayer(map: MapLibreMap): void {
  const ids = map.getLayersOrder();
  const top = ids.slice(-YOU_LAYERS.length);
  if (YOU_LAYERS.every((id, i) => top[i] === id)) return;
  for (const id of YOU_LAYERS) if (map.getLayer(id)) map.moveLayer(id);
}

/** Draw you at `at` (or hide the marker with null). */
export function setYouLayer(map: MapLibreMap, at: [number, number] | null, heading: number | null, accuracyM: number | null): void {
  const src = map.getSource<GeoJSONSource>(SRC);
  if (!src) return;
  void src.setData({
    type: "FeatureCollection",
    features: at ? [{ type: "Feature", properties: heading === null ? {} : { heading }, geometry: { type: "Point", coordinates: at } }] : [],
  });
  if (!at) return;
  // Metres to pixels doubles with each zoom level; below 6 m the dot itself says enough.
  const r = Math.max(0, accuracyM ?? 0) < 6 ? 0 : (accuracyM ?? 0) * pxPerMetreZ22(at[1]);
  map.setPaintProperty("you-accuracy", "circle-radius", r ? ["interpolate", ["exponential", 2], ["zoom"], 0, r / 2 ** 22, 22, r] : 0);
}

export function removeYouLayer(map: MapLibreMap): void {
  for (const id of [...YOU_LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SRC)) map.removeSource(SRC);
}
