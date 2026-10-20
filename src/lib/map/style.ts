import type {
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";

/**
 * The data layers, defined once and used two ways: injected on top of the
 * vector basemap (`installDataLayers`) and baked into the raster fallback style.
 * Extruded columns are drawn by MapLibre itself (`fill-extrusion`) — one canvas,
 * one render pass, so the prisms depth-sort against the basemap correctly.
 */

const TILE_URL =
  import.meta.env.VITE_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const SOURCE_IDS = {
  basemap: "osm",
  neighborhoods: "neighborhoods",
  blocks: "blocks",
  emphasis: "emphasis",
  blockSelection: "block-selection",
} as const;

export const LAYER_IDS = {
  basemap: "osm-raster",
  buildings: "basemap-buildings",
  neighborhoods: "neighborhood-extrusion",
  neighborhoodOutline: "neighborhood-outline",
  blocks: "block-extrusion",
  emphasis: "emphasis-outline",
  blockSelection: "block-selection-outline",
} as const;

function emptyCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export const DATA_SOURCES: Record<string, SourceSpecification> = {
  neighborhoods: { type: "geojson", data: emptyCollection() },
  blocks: { type: "geojson", data: emptyCollection() },
  emphasis: { type: "geojson", data: emptyCollection() },
  "block-selection": { type: "geojson", data: emptyCollection() },
};

export const DATA_LAYERS: LayerSpecification[] = [
  {
    id: LAYER_IDS.neighborhoods,
    type: "fill-extrusion",
    source: SOURCE_IDS.neighborhoods,
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      // Translucent enough that the streets and buildings underneath still read
      // through the color; the alpha in the feature color carries the rest.
      "fill-extrusion-opacity": 0.7,
    },
  },
  {
    id: LAYER_IDS.neighborhoodOutline,
    type: "line",
    source: SOURCE_IDS.neighborhoods,
    layout: { "line-join": "round" },
    paint: {
      "line-color": "rgba(8, 12, 22, 0.55)",
      "line-width": 0.7,
    },
  },
  {
    id: LAYER_IDS.blocks,
    type: "fill-extrusion",
    source: SOURCE_IDS.blocks,
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.8,
    },
  },
  {
    id: LAYER_IDS.emphasis,
    type: "line",
    source: SOURCE_IDS.emphasis,
    layout: { "line-join": "round" },
    paint: {
      "line-color": ["match", ["get", "tone"], "selected", "#ffffff", "#38bdf8"],
      "line-width": ["match", ["get", "tone"], "selected", 3, 2.4],
    },
  },
  {
    id: LAYER_IDS.blockSelection,
    type: "line",
    source: SOURCE_IDS.blockSelection,
    layout: { "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": 2.5,
    },
  },
];

/**
 * The last-resort basemap: plain OSM raster with the data layers baked in. Only
 * used when the vector style cannot be fetched, so the map is never blank.
 */
export function buildFallbackStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [TILE_URL],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      },
      ...DATA_SOURCES,
    },
    layers: [
      {
        id: LAYER_IDS.basemap,
        type: "raster",
        source: SOURCE_IDS.basemap,
        paint: {
          "raster-brightness-min": 0.08,
          "raster-brightness-max": 0.7,
          "raster-saturation": -0.35,
          "raster-contrast": 0.05,
        },
      },
      ...DATA_LAYERS,
    ],
  };
}
