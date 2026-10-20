import type { Map as MapLibreMap } from "maplibre-gl";
import { DATA_LAYERS, DATA_SOURCES, LAYER_IDS } from "./style";

/**
 * A keyless vector basemap: real streets, water, parks and — from street level
 * up — actual extruded buildings. That is what makes a tilted view read as a
 * city rather than a floating colored plate.
 *
 * Override with `VITE_BASEMAP_STYLE` to point at any MapLibre style URL.
 */
export const BASEMAP_STYLE_URL =
  import.meta.env.VITE_BASEMAP_STYLE ??
  "https://tiles.openfreemap.org/styles/liberty";

/** OpenMapTiles schema names, used only if the style has no 3D buildings yet. */
const VECTOR_SOURCE = "openmaptiles";
const BUILDING_SOURCE_LAYER = "building";

/**
 * Buildings only matter once you are close enough to be among them, so the
 * layer starts well before the citywide view bottoms out.
 */
const BUILDINGS_MIN_ZOOM = 13.2;

function addBuildings(map: MapLibreMap): void {
  if (map.getLayer(LAYER_IDS.buildings)) return;
  const source = map.getSource(VECTOR_SOURCE);
  if (!source || source.type !== "vector") return;
  // The style may already extrude buildings; drawing them twice z-fights.
  const hasExtrusions = (map.getStyle().layers ?? []).some(
    (layer) => layer.type === "fill-extrusion",
  );
  if (hasExtrusions) return;

  map.addLayer({
    id: LAYER_IDS.buildings,
    type: "fill-extrusion",
    source: VECTOR_SOURCE,
    "source-layer": BUILDING_SOURCE_LAYER,
    minzoom: BUILDINGS_MIN_ZOOM,
    paint: {
      "fill-extrusion-color": "#d8d2c8",
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 12],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.95,
    },
  });
}

/**
 * Adds the data sources and layers above whatever basemap the style provides,
 * then lifts the basemap's labels back on top so street names survive the 3D
 * overlay. Idempotent: safe to call again after a style reload.
 */
export function installDataLayers(map: MapLibreMap): void {
  addBuildings(map);

  for (const [id, source] of Object.entries(DATA_SOURCES)) {
    if (!map.getSource(id)) map.addSource(id, source);
  }

  for (const layer of DATA_LAYERS) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }

  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === "symbol") map.moveLayer(layer.id);
  }
}

/**
 * Horizon haze — the cue that sells depth in a tilted view.
 *
 * `range` is measured as a multiple of the camera's distance from the ground,
 * so the numbers that look right from a kilometre up put an opaque grey wall a
 * few metres ahead at street level. Walking gets its own, much more distant
 * haze: enough to fade the far end of the block, never enough to hide the
 * street you are standing on.
 */
export function applyAtmosphere(map: MapLibreMap, street = false): void {
  // MapLibre has no Mapbox-style `setFog`; its horizon haze is the `sky`
  // spec. The previous `map.setFog(...)` did not type-check against
  // maplibre-gl 4.7 and threw at runtime on load.
  if (typeof map.setSky !== "function") return;
  map.setSky({
    "sky-color": "#a9c7ea",
    "horizon-color": "#eaf2fb",
    "fog-color": "#eaf2fb",
    // Street level: fog only at the far end of the view, never on the block.
    "fog-ground-blend": street ? 0.9 : 0.5,
    "horizon-fog-blend": street ? 0.2 : 0.5,
    "sky-horizon-blend": 0.6,
    "atmosphere-blend": 0,
  });
}
