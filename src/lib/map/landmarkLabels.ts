import type { FeatureCollection, Point } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { LANDMARKS } from "./landmarks";

/**
 * Landmark names on the light map (#363): the hero landmarks' names, so people know where they are without the glTF models, which
 * belong to the optional detailed city. Plain MapLibre symbols, no three.js.
 * While walking the basemap labels step aside, and these go with them.
 */
export const LANDMARK_LABELS_SOURCE = "landmark-labels";
export const LANDMARK_LABELS_LAYER = "landmark-labels";

export function landmarkLabelsGeoJson(): FeatureCollection<Point, { name: string }> {
  return {
    type: "FeatureCollection",
    features: LANDMARKS.map((l) => ({
      type: "Feature",
      properties: { name: l.name },
      geometry: { type: "Point", coordinates: [l.lon, l.lat] },
    })),
  };
}

/** Adds the source and layer once per style; safe to call again. */
export function installLandmarkLabels(map: MapLibreMap, color: string, halo: string): void {
  if (!map.getSource(LANDMARK_LABELS_SOURCE)) {
    map.addSource(LANDMARK_LABELS_SOURCE, { type: "geojson", data: landmarkLabelsGeoJson() });
  }
  if (!map.getLayer(LANDMARK_LABELS_LAYER)) {
    map.addLayer({
      id: LANDMARK_LABELS_LAYER,
      type: "symbol",
      source: LANDMARK_LABELS_SOURCE,
      minzoom: 11,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 16, 13],
        "text-anchor": "top",
        "text-offset": [0, 0.6],
        "text-optional": true,
        "symbol-z-order": "source",
      },
      paint: { "text-color": color, "text-halo-color": halo, "text-halo-width": 1.4 },
    });
  } else {
    map.setPaintProperty(LANDMARK_LABELS_LAYER, "text-color", color);
    map.setPaintProperty(LANDMARK_LABELS_LAYER, "text-halo-color", halo);
  }
}
