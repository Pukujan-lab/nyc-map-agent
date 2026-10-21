import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";

/**
 * The data layers, defined once and used two ways: injected on top of the
 * vector basemap (`installDataLayers`) and baked into the raster fallback style.
 *
 * There is deliberately **one** hue here. Areas are drawn as see-through glass
 * whose *height* carries the count, over the basemap's own streets; the reading
 * of "how much happened here" is a silhouette, not a colour band. What makes
 * the shapes legible is the line work on top: a boundary around every ~300 m
 * square, a boundary around every neighborhood, and a heavier borough line.
 */

const TILE_URL =
  import.meta.env.VITE_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Block column height: a GeoJSON property for the Socrata grid squares, a
 * feature-state for real tax blocks drawn from PMTiles (src/lib/map/blockTiles.ts).
 */
export const BLOCK_HEIGHT: ExpressionSpecification = [
  "coalesce", ["feature-state", "height"], ["get", "height"], 0,
];

export const SOURCE_IDS = {
  basemap: "osm",
  neighborhoods: "neighborhoods",
  blocks: "blocks",
  boroughs: "boroughs",
  emphasis: "emphasis",
  blockSelection: "block-selection",
  route: "walk-route",
  areas: "areas",
  blockPoints: "block-points",
} as const;

/** Filled-areas opacity: strong overview, a tint once streets matter. */
export const FILL_OPACITY = ["interpolate", ["linear"], ["zoom"], 14, 0.62, 16, 0.42, 18, 0.22] as never;

export const LAYER_IDS = {
  basemap: "osm-raster",
  buildings: "basemap-buildings",
  neighborhoods: "neighborhood-extrusion",
  neighborhoodOutline: "neighborhood-outline",
  blocks: "block-extrusion",
  blockOutline: "block-outline",
  boroughOutline: "borough-outline",
  emphasis: "emphasis-outline",
  blockSelection: "block-selection-rim",
  blockSelectionEdge: "block-selection-edge",
  routeCasing: "walk-route-casing",
  routeLine: "walk-route-line",
  routeEnds: "walk-route-ends",
  areaFill: "area-fill",
  areaColumns: "area-columns",
  areaOutline: "area-outline",
  heat: "block-heat",
} as const;

/**
 * Sequential ramp for the filled-areas view (ColorBrewer YlOrRd, colour-blind
 * safe). Input `t` is sqrt(value / peak), so one extreme area does not wash
 * everything else out.
 */
export const CHOROPLETH_RAMP: Array<[number, string]> = [
  [0, "#ffffcc"],
  [0.25, "#fed976"],
  [0.5, "#fd8d3c"],
  [0.75, "#e31a1c"],
  [1, "#800026"],
];

const rampExpression = [
  "interpolate",
  ["linear"],
  ["get", "t"],
  ...CHOROPLETH_RAMP.flat(),
] as unknown as string;

/** The single glass hue every data volume is painted with. */
const GLASS = "#64748b";

function emptyCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export const DATA_SOURCES: Record<string, SourceSpecification> = {
  // Coastline boundaries carry pier-level detail; a higher tolerance smooths
  // them at city zooms instead of drawing a stair-stepped edge.
  neighborhoods: { type: "geojson", data: emptyCollection(), tolerance: 1 },
  blocks: { type: "geojson", data: emptyCollection() },
  boroughs: { type: "geojson", data: emptyCollection(), tolerance: 1.5 },
  emphasis: { type: "geojson", data: emptyCollection() },
  "block-selection": { type: "geojson", data: emptyCollection() },
  "walk-route": { type: "geojson", data: emptyCollection() },
  areas: { type: "geojson", data: emptyCollection() },
  "block-points": { type: "geojson", data: emptyCollection() },
};

export const DATA_LAYERS: LayerSpecification[] = [
  {
    id: LAYER_IDS.areaFill,
    type: "fill",
    source: SOURCE_IDS.areas,
    layout: { visibility: "none" },
    // Lighter as you zoom in, so streets and buildings show through (#46).
    paint: { "fill-color": rampExpression, "fill-opacity": FILL_OPACITY },
  },
  {
    id: LAYER_IDS.areaColumns,
    type: "fill-extrusion",
    source: SOURCE_IDS.areas,
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": GLASS,
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-opacity": 0.35,
    },
  },
  {
    id: LAYER_IDS.areaOutline,
    type: "line",
    source: SOURCE_IDS.areas,
    layout: { visibility: "none", "line-join": "round" },
    paint: { "line-color": "rgba(30, 41, 59, 0.45)", "line-width": 0.6 },
  },
  {
    id: LAYER_IDS.heat,
    type: "heatmap",
    source: SOURCE_IDS.blockPoints,
    layout: { visibility: "none" },
    paint: {
      "heatmap-weight": ["get", "w"],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 14, 22, 17, 48],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 16, 2],
      "heatmap-opacity": 0.75,
    },
  },
  {
    id: LAYER_IDS.neighborhoods,
    type: "fill-extrusion",
    source: SOURCE_IDS.neighborhoods,
    paint: {
      "fill-extrusion-color": GLASS,
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      // Translucent enough that the streets underneath still read through the
      // volume — the count is the silhouette, not a colour.
      "fill-extrusion-opacity": 0.3,
    },
  },
  {
    id: LAYER_IDS.blocks,
    type: "fill-extrusion",
    source: SOURCE_IDS.blocks,
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": GLASS,
      "fill-extrusion-height": BLOCK_HEIGHT,
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.42,
    },
  },
  {
    id: LAYER_IDS.blockOutline,
    type: "line",
    source: SOURCE_IDS.blocks,
    // Below this the 250 m squares are a couple of pixels across and the grid
    // turns into a solid mesh.
    minzoom: 11.5,
    layout: { "line-join": "round", visibility: "none" },
    paint: {
      "line-color": "rgba(51, 65, 85, 0.38)",
      "line-width": 0.5,
    },
  },
  {
    id: LAYER_IDS.neighborhoodOutline,
    type: "line",
    source: SOURCE_IDS.neighborhoods,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "rgba(30, 41, 59, 0.5)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 1.1],
      "line-blur": 0.3,
    },
  },
  {
    id: LAYER_IDS.boroughOutline,
    type: "line",
    source: SOURCE_IDS.boroughs,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      // The county line: heavier and darker than a neighborhood edge, so the
      // five boroughs read as the top level of the map. Thin at city zooms,
      // where a 2.4 px line turned every pier into a jagged tooth.
      "line-color": "rgba(15, 23, 42, 0.7)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 1.8, 16, 2.4],
      "line-blur": 0.4,
    },
  },
  {
    id: LAYER_IDS.emphasis,
    type: "line",
    source: SOURCE_IDS.emphasis,
    layout: { "line-join": "round" },
    paint: {
      // Near-black for the picked neighborhood — white vanished against the
      // light basemap, and this has to read at any tilt.
      "line-color": ["match", ["get", "tone"], "selected", "#0b1220", "#38bdf8"],
      "line-width": ["match", ["get", "tone"], "selected", 3, 2.4],
    },
  },
  {
    id: LAYER_IDS.blockSelection,
    type: "fill-extrusion",
    source: SOURCE_IDS.blockSelection,
    paint: {
      "fill-extrusion-color": "#ffffff",
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.9,
    },
  },
  {
    id: LAYER_IDS.blockSelectionEdge,
    type: "line",
    source: SOURCE_IDS.blockSelection,
    layout: { "line-join": "round" },
    paint: {
      "line-color": "#0b1220",
      "line-width": 1.5,
      "line-opacity": 0.75,
    },
  },
  // Walking directions: a dark casing under a bright line, plus A/B dots.
  {
    id: LAYER_IDS.routeCasing,
    type: "line",
    source: SOURCE_IDS.route,
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#0b1220", "line-width": 8, "line-opacity": 0.6 },
  },
  {
    id: LAYER_IDS.routeLine,
    type: "line",
    source: SOURCE_IDS.route,
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#38bdf8", "line-width": 4.5 },
  },
  {
    id: LAYER_IDS.routeEnds,
    type: "circle",
    source: SOURCE_IDS.route,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 7,
      "circle-color": ["match", ["get", "end"], "start", "#22c55e", "#ef4444"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
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
