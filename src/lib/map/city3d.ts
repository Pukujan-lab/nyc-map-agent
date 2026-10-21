import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";

/**
 * Textured 3D city (pilot area): NYC footprints with facade patterns picked by
 * building type, plus low-poly props (trees, hydrants, benches, street-light
 * poles) at their real locations. Everything is MapLibre fill-extrusion on one
 * static PMTiles file, so there is no second renderer and no live query.
 * Textures and props only draw from zoom 16 (LOD); tiles stop at z16, which
 * caps how many props a view can hold.
 */
export const CITY3D_TILES = "/tiles/nyc-city-pilot.pmtiles";
export const CITY3D_MIN_ZOOM = 16;
export const FACADES = ["rowhouse", "walkup", "prewar", "modern", "tower", "storefront"] as const;
const SOURCE = "city3d";
const STOREFRONT_M = 4.5;

export const CITY3D_LAYERS = ["city3d-storefront", "city3d-walls", "city3d-roofs", "city3d-props"] as const;

let protocolAdded = false;
/** Loaded on first use so neither pmtiles nor a second maplibre import lands in the main chunk. */
async function ensureProtocol() {
  if (protocolAdded) return;
  const [{ default: maplibregl }, { Protocol }] = await Promise.all([import("maplibre-gl"), import("pmtiles")]);
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolAdded = true;
}

async function loadFacades(map: MapLibreMap): Promise<void> {
  await Promise.all(
    FACADES.map(async (name) => {
      const id = `facade-${name}`;
      if (map.hasImage(id)) return;
      const img = await map.loadImage(`/textures/${id}.png`);
      if (!map.hasImage(id)) map.addImage(id, img.data);
    }),
  );
}

const ROOF: ExpressionSpecification = [
  "match", ["get", "facade"],
  "tower", "#9fb4c6",
  "modern", "#b7bcc2",
  "prewar", "#b8ab95",
  "#8d8a86",
];

const PROP_COLOR: ExpressionSpecification = [
  "match", ["get", "kind"],
  "canopy", "#4f8a3c",
  "trunk", "#6b4a2f",
  "hydrant", "#c8352b",
  "bench", "#7a5a3a",
  "pole", "#5d646b",
  "lamp", "#f2e7b8",
  "#888888",
];

/** Adds the source, images and layers (hidden). Safe to call after every style load. */
export async function installCity3d(map: MapLibreMap): Promise<void> {
  await ensureProtocol();
  if (!map.getSource(SOURCE)) {
    map.addSource(SOURCE, {
      type: "vector",
      url: `pmtiles://${window.location.origin}${CITY3D_TILES}`,
      attribution: "NYC Open Data (footprints, PLUTO, trees, hydrants, benches)",
    });
  }
  await loadFacades(map);
  if (map.getLayer("city3d-walls")) return;
  const beforeId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  const common = { source: SOURCE, minzoom: CITY3D_MIN_ZOOM, layout: { visibility: "none" as const } };
  map.addLayer(
    {
      ...common,
      id: "city3d-storefront",
      type: "fill-extrusion",
      "source-layer": "buildings",
      filter: ["==", ["get", "store"], 1],
      paint: {
        "fill-extrusion-pattern": "facade-storefront",
        "fill-extrusion-height": ["min", STOREFRONT_M, ["get", "h"]],
        "fill-extrusion-base": 0,
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      ...common,
      id: "city3d-walls",
      type: "fill-extrusion",
      "source-layer": "buildings",
      paint: {
        "fill-extrusion-pattern": ["concat", "facade-", ["get", "facade"]],
        "fill-extrusion-height": ["get", "h"],
        "fill-extrusion-base": ["case", ["==", ["get", "store"], 1], ["min", STOREFRONT_M, ["get", "h"]], 0],
      },
    },
    beforeId,
  );
  // Patterns also paint the roof; a thin solid cap keeps roofs plain like Streets GL.
  map.addLayer(
    {
      ...common,
      id: "city3d-roofs",
      type: "fill-extrusion",
      "source-layer": "buildings",
      paint: {
        "fill-extrusion-color": ROOF,
        "fill-extrusion-base": ["get", "h"],
        "fill-extrusion-height": ["+", ["get", "h"], 0.4],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      ...common,
      id: "city3d-props",
      type: "fill-extrusion",
      "source-layer": "props",
      paint: {
        "fill-extrusion-color": PROP_COLOR,
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-height": ["get", "height"],
      },
    },
    beforeId,
  );
}

/** Basemap 3D buildings stop where the textured ones start, so they never z-fight. */
export function setCity3dVisible(map: MapLibreMap, on: boolean): void {
  for (const id of CITY3D_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "fill-extrusion" || layer.id.startsWith("city3d-")) continue;
    if (!("source-layer" in layer) || layer["source-layer"] !== "building") continue;
    map.setLayerZoomRange(layer.id, layer.minzoom ?? 0, on ? CITY3D_MIN_ZOOM : 24);
  }
  // Shop/POI labels pile up on the textured storefronts at street level; transit stays.
  for (const layer of map.getStyle().layers ?? []) {
    if (!isPoiLabelLayer(layer)) continue;
    const min = layer.minzoom ?? 0;
    map.setLayerZoomRange(layer.id, min, on ? Math.max(min, POI_LABEL_MAX_ZOOM) : 24);
  }
}

/** Basemap POI labels end at this zoom while the 3D city is on. */
export const POI_LABEL_MAX_ZOOM = 16;

export function isPoiLabelLayer(layer: { id: string; type: string; "source-layer"?: string }): boolean {
  return layer.type === "symbol" && layer["source-layer"] === "poi" && !/transit/.test(layer.id);
}
