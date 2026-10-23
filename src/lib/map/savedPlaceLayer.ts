import type { Map as MapLibreMap } from "maplibre-gl";
import type { SavedPlaces } from "./savedPlaces";

/** Home and work dots. The name says which is which. */
export const SAVED_SOURCE = "saved-places";
export const SAVED_LAYER = "saved-place-pin";
export const SAVED_LABEL = "saved-place-label";

function collection(places: SavedPlaces): GeoJSON.FeatureCollection {
  const features = (["home", "work"] as const).flatMap((kind) => {
    const spot = places[kind];
    if (!spot) return [];
    return [{
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [spot.lon, spot.lat] },
      properties: { kind, name: kind === "home" ? "Home" : "Work", label: spot.label },
    }];
  });
  return { type: "FeatureCollection", features };
}

/** Draw the saved pins, or remove them when neither place is saved. */
export function syncSavedPlaces(map: MapLibreMap, places: SavedPlaces): () => void {
  const remove = () => {
    if (map.getLayer(SAVED_LABEL)) map.removeLayer(SAVED_LABEL);
    if (map.getLayer(SAVED_LAYER)) map.removeLayer(SAVED_LAYER);
    if (map.getSource(SAVED_SOURCE)) map.removeSource(SAVED_SOURCE);
  };
  remove();
  const data = collection(places);
  if (!data.features.length) return () => {};
  map.addSource(SAVED_SOURCE, { type: "geojson", data });
  if (!map.getLayer(SAVED_LAYER)) {
    map.addLayer({
      id: SAVED_LAYER,
      type: "circle",
      source: SAVED_SOURCE,
      minzoom: 9,
      paint: {
        "circle-color": "#F2F1ED",
        "circle-stroke-color": "#121212",
        "circle-stroke-width": 2,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 8],
      },
    });
  }
  if (!map.getLayer(SAVED_LABEL)) {
    map.addLayer({
      id: SAVED_LABEL,
      type: "symbol",
      source: SAVED_SOURCE,
      minzoom: 11,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-offset": [0, 1.05],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: { "text-color": "#121212", "text-halo-color": "#F2F1ED", "text-halo-width": 1.4 },
    });
  }
  return remove;
}
