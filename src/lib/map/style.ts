import type { StyleSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

/**
 * The basemap and the data layers, in one MapLibre style. Extruded columns are
 * drawn by MapLibre itself (`fill-extrusion`), not by a second renderer layered
 * on top — one canvas, one render pass, and the prisms depth-sort against the
 * basemap correctly.
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
  neighborhoods: "neighborhood-extrusion",
  neighborhoodOutline: "neighborhood-outline",
  blocks: "block-extrusion",
  emphasis: "emphasis-outline",
  blockSelection: "block-selection-outline",
} as const;

function emptyCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

const style: StyleSpecification = {
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
    neighborhoods: { type: "geojson", data: emptyCollection() },
    blocks: { type: "geojson", data: emptyCollection() },
    emphasis: { type: "geojson", data: emptyCollection() },
    "block-selection": { type: "geojson", data: emptyCollection() },
  },
  layers: [
    {
      id: "osm-raster",
      type: "raster",
      source: "osm",
      paint: {
        // Lightened just enough that four saturated fills stay readable.
        "raster-brightness-min": 0.08,
        "raster-brightness-max": 0.7,
        "raster-saturation": -0.35,
        "raster-contrast": 0.05,
      },
    },
    {
      id: "neighborhood-extrusion",
      type: "fill-extrusion",
      source: "neighborhoods",
      paint: {
        "fill-extrusion-color": ["get", "color"],
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": 0,
        // The alpha already lives in the feature color, so opacity stays 1.
        "fill-extrusion-opacity": 1,
      },
    },
    {
      id: "neighborhood-outline",
      type: "line",
      source: "neighborhoods",
      layout: { "line-join": "round" },
      paint: {
        "line-color": "rgba(8, 12, 22, 0.55)",
        "line-width": 0.7,
      },
    },
    {
      id: "block-extrusion",
      type: "fill-extrusion",
      source: "blocks",
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": ["get", "color"],
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 1,
      },
    },
    {
      id: "emphasis-outline",
      type: "line",
      source: "emphasis",
      layout: { "line-join": "round" },
      paint: {
        "line-color": [
          "match",
          ["get", "tone"],
          "selected",
          "#ffffff",
          "#38bdf8",
        ],
        "line-width": ["match", ["get", "tone"], "selected", 3, 2.4],
      },
    },
    {
      id: "block-selection-outline",
      type: "line",
      source: "block-selection",
      layout: { "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": 2.5,
      },
    },
  ],
};

export function buildMapStyle(): StyleSpecification {
  return style;
}
