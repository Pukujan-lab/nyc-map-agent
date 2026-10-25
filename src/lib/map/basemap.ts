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

  // The filled areas tint the ground, not the streets: they sit under the
  // basemap's roads, so zoomed in a block reads as a tinted block with its
  // streets still drawn instead of one flat tan sheet (#46).
  const firstRoad = (map.getStyle().layers ?? []).find(
    (l) => l.type === "line" && "source-layer" in l && l["source-layer"] === "transportation",
  )?.id;
  if (firstRoad && map.getLayer(LAYER_IDS.areaFill)) map.moveLayer(LAYER_IDS.areaFill, firstRoad);
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

/**
 * Real-world widths in metres for the Liberty road layers. The style draws
 * roads in screen pixels that stop growing around z18, so at a 1.7 m eye
 * (z21-22) a street became a hairline on a white page. While walking, roads
 * are re-sized in ground metres and painted asphalt, casings become kerbs
 * and sidewalks, and the bare ground becomes concrete.
 */
const ROAD_WIDTH_M: Array<[RegExp, number]> = [
  [/motorway(?!_link)/, 22],
  // Kerb-to-kerb, matched to where the tree census puts street trees (the
  // kerb line): a typical side street measures ~8 m, avenues ~15 m. Wider
  // carriageways painted asphalt under the trees and kerbside buildings.
  [/trunk_primary/, 15],
  [/secondary_tertiary/, 12],
  [/link/, 8],
  [/minor/, 8],
  [/^bridge_street/, 8],
  [/service_track/, 6],
  [/path_pedestrian/, 3],
];
/** Each kerb + sidewalk adds this much either side of the carriageway. */
const SIDEWALK_M = 3.5;
/** Metres per pixel at zoom 0 at NYC's latitude (40.7°). */
const M_PER_PX_Z0 = 118_700;
const STREET_COLORS = {
  ground: "#b9b5ad",
  asphalt: "#4b4e54",
  sidewalk: "#c9c4ba",
  path: "#bfb6a6",
  park: "#6f9a5b",
} as const;

function metresWidth(m: number): unknown {
  // Exponential base 2 in zoom = constant ground width.
  return ["interpolate", ["exponential", 2], ["zoom"], 15, (m * 2 ** 15) / M_PER_PX_Z0, 24, (m * 2 ** 24) / M_PER_PX_Z0];
}

const saved = new WeakMap<MapLibreMap, Map<string, unknown>>();

function setPaint(map: MapLibreMap, layer: string, prop: string, value: unknown, on: boolean): void {
  if (!map.getLayer(layer)) return;
  let store = saved.get(map);
  if (!store) saved.set(map, (store = new Map()));
  const key = `${layer}|${prop}`;
  if (on) {
    if (!store.has(key)) store.set(key, map.getPaintProperty(layer, prop as never) ?? null);
    map.setPaintProperty(layer, prop as never, value as never);
  } else if (store.has(key)) {
    map.setPaintProperty(layer, prop as never, (store.get(key) ?? undefined) as never);
    store.delete(key);
  }
}

/** Sidewalk texture (generated in-repo by scripts/make-facade-textures.py, CC0). */
const CONCRETE = "street-concrete";
/** Lawn texture for parks at street level (ambientCG Grass001, CC0); a flat green reads as paint. */
const GRASS = "street-grass";

/** Loads the sidewalk texture once per style; call before applyStreetPalette. */
export async function loadStreetTextures(map: MapLibreMap): Promise<void> {
  await Promise.all(
    [[CONCRETE, "/textures/concrete.png"], [GRASS, "/textures/grass.png"]].map(async ([id, url]) => {
      if (map.hasImage(id)) return;
      const { data } = await map.loadImage(url);
      if (!map.hasImage(id)) map.addImage(id, data);
    }),
  );
}

/** Street-level ground, roads and sidewalks; `street = false` restores the style. */
export function applyStreetPalette(map: MapLibreMap, street: boolean): void {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;
    if (layer.type === "background") setPaint(map, id, "background-color", STREET_COLORS.ground, street);
    if (layer.type === "fill" && /^landuse_residential$/.test(id)) setPaint(map, id, "fill-color", STREET_COLORS.ground, street);
    if (layer.type === "fill" && /^park$|landcover_grass/.test(id)) {
      setPaint(map, id, "fill-color", STREET_COLORS.park, street);
      setPaint(map, id, "fill-pattern", map.hasImage(GRASS) ? GRASS : undefined, street);
      setPaint(map, id, "fill-opacity", 1, street);
    }
    // Plazas use the style's tiny hatch pattern, which shimmers white over the lawns at eye level.
    if (layer.type === "fill" && id === "road_area_pattern") setPaint(map, id, "fill-pattern", map.hasImage(CONCRETE) ? CONCRETE : undefined, street);
    // The 0.5 m choropleth slabs span whole grid squares, streets included:
    // at eye level they read as knee-high white walls across the road.
    if (id === "block-extrusion" || id === "block-selection-rim") setPaint(map, id, "fill-extrusion-opacity", 0, street);
    // Tunnels run under the street; drawn on the ground they are a pale stripe.
    if (layer.type === "line" && /^tunnel_/.test(id)) setPaint(map, id, "line-opacity", 0, street);
    if (layer.type !== "line" || !/^(road|bridge)_/.test(id) || /rail/.test(id)) continue;
    const width = ROAD_WIDTH_M.find(([re]) => re.test(id))?.[1];
    if (!width) continue;
    const casing = id.endsWith("_casing");
    const pedestrian = /path_pedestrian/.test(id);
    if (casing) setPaint(map, id, "line-pattern", map.hasImage(CONCRETE) ? CONCRETE : undefined, street);
    setPaint(map, id, "line-color", casing ? STREET_COLORS.sidewalk : pedestrian ? STREET_COLORS.path : STREET_COLORS.asphalt, street);
    setPaint(map, id, "line-width", metresWidth(casing ? width + 2 * SIDEWALK_M : width), street);
    if (!pedestrian) setPaint(map, id, "line-dasharray", undefined, street);
  }
}
