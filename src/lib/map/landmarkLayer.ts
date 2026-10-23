import type { Map as MapLibreMap } from "maplibre-gl";
import { landmarkCollection } from "./cityLandmarks";

/** Ivory dots and names for the citywide landmark list. */
export const LANDMARK_SOURCE = "landmarks";
export const LANDMARK_LAYER = "landmark-pin";
export const LANDMARK_LABEL = "landmark-label";

const INK = "#121212";
const IVORY = "#F2F1ED";

/** Add or remove the landmark dots. Returns a cleanup that removes them. */
export function syncLandmarks(map: MapLibreMap, on: boolean): () => void {
  const remove = () => {
    if (map.getLayer(LANDMARK_LABEL)) map.removeLayer(LANDMARK_LABEL);
    if (map.getLayer(LANDMARK_LAYER)) map.removeLayer(LANDMARK_LAYER);
    if (map.getSource(LANDMARK_SOURCE)) map.removeSource(LANDMARK_SOURCE);
  };
  if (!on) {
    remove();
    return () => {};
  }
  if (!map.getSource(LANDMARK_SOURCE)) {
    map.addSource(LANDMARK_SOURCE, {
      type: "geojson",
      data: landmarkCollection(),
      attribution: "Landmark text and photos: Wikipedia (CC BY-SA)",
    });
  }
  if (!map.getLayer(LANDMARK_LAYER)) {
    map.addLayer({
      id: LANDMARK_LAYER,
      type: "circle",
      source: LANDMARK_SOURCE,
      minzoom: 10,
      paint: {
        "circle-color": IVORY,
        "circle-stroke-color": INK,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 15, 2.5],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7],
      },
    });
  }
  if (!map.getLayer(LANDMARK_LABEL)) {
    map.addLayer({
      id: LANDMARK_LABEL,
      type: "symbol",
      source: LANDMARK_SOURCE,
      minzoom: 12,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.05],
        "text-anchor": "top",
        "text-optional": true,
        "text-pitch-alignment": "viewport",
        "text-max-width": 10,
      },
      paint: {
        "text-color": INK,
        "text-halo-color": IVORY,
        "text-halo-width": 1.4,
      },
    });
  }
  return remove;
}
