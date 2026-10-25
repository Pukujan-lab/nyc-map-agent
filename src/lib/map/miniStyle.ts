import type { FilterSpecification, GeoJSONSource, LayerSpecification, Map as MapLibreMap, SourceSpecification, StyleSpecification } from "maplibre-gl";
import { POI_LAYERS } from "./places";

/**
 * Point layers a Layers switch already draws on the main map.
 * Street blade signs (`parking-signs`) stay off: the inset is zoomed out of that range.
 * Restrooms are not copied from here: the inset draws its own tappable `mini-restrooms`
 * layer (see restrooms/layers.ts), so there is exactly one restroom layer on the inset.
 */
const FILTER_POINT_LAYERS: Record<string, readonly string[]> = {
  restroomShops: ["place-toilets"],
  parking: ["parking-icons"],
  events: ["events-pin", "events-now"],
  ferry: ["ferry-terminals", "ferry-vessels"],
  schools: ["city3d-schools"],
};
const BUS_STOP_LAYER = "poi_transit";

/** Which Layers switches should contribute points to the street-view inset. */
export interface InsetFilters {
  /** OpenMapTiles classes for the chosen Places (and quick groups). Empty hides them. */
  placeClasses: readonly string[];
  /** Basemap bus-stop icons. Rail icons on the same layer stay with them. */
  busStops: boolean;
  /**
   * Other point switches: restrooms, restroomShops, parking, events, ferry, schools.
   * Shops are included only while Restrooms is on, matching the main map.
   */
  on: ReadonlySet<string>;
}

export function insetFilters(input: {
  placeClasses: readonly string[];
  busStops: boolean;
  restrooms: boolean;
  shops: boolean;
  parking: boolean;
  events: boolean;
  ferry: boolean;
  schools: boolean;
}): InsetFilters {
  const on = new Set<string>();
  if (input.restrooms) on.add("restrooms");
  if (input.restrooms && input.shops) on.add("restroomShops");
  if (input.parking) on.add("parking");
  if (input.events) on.add("events");
  if (input.ferry) on.add("ferry");
  if (input.schools) on.add("schools");
  return { placeClasses: input.placeClasses, busStops: input.busStops, on };
}

/** True when this layer id is one of the point layers a switch draws. Pure. */
export function pointLayerOn(id: string, filters: InsetFilters): boolean {
  if (POI_LAYERS.test(id)) return filters.placeClasses.length > 0;
  if (id === BUS_STOP_LAYER) return filters.busStops;
  for (const key of Object.keys(FILTER_POINT_LAYERS)) {
    if (FILTER_POINT_LAYERS[key].includes(id)) return filters.on.has(key);
  }
  return false;
}

function isBase(l: { id: string; type: string; "source-layer"?: string }): boolean {
  if (l.id.startsWith("tunnel_")) return false;
  if (l.type === "background") return true;
  // Flat footprints. Extrusions stay off: the inset is a flat map, not a second 3D city.
  if (l.type === "fill" && l["source-layer"] === "building") return true;
  if (l.type === "fill" && (l["source-layer"] === "water" || l["source-layer"] === "park")) return true;
  if (l.type === "line" && l["source-layer"] === "transportation" && !/rail/.test(l.id)) return true;
  if (l.id === "transit-station-raised") return true;
  return /^transit-(line|line-under|station|bullet)$/.test(l.id);
}

/** Drop street-level pattern images and metre widths the inset does not have. */
export function miniLayer(l: LayerSpecification): LayerSpecification {
  const next = { ...l, minzoom: undefined, maxzoom: undefined } as LayerSpecification;
  if ((next.type === "line" || next.type === "fill") && next.paint) {
    const paint = { ...next.paint } as Record<string, unknown>;
    delete paint["line-pattern"];
    delete paint["fill-pattern"];
    if (next.type === "line") {
      paint["line-width"] = /casing/.test(next.id) ? 4 : 2;
      if (paint["line-opacity"] === 0) delete paint["line-opacity"];
    }
    next.paint = paint as typeof next.paint;
  }
  // The tilted map lifts this dot above the viaduct. The mini map is flat, so the dot sits on the station.
  if (next.id === "transit-station-raised" && next.type === "circle") next.paint = { ...next.paint, "circle-translate": [0, 0] };
  return next;
}

/** Layers the street-level mini map keeps from the loaded style. Pure, for tests. */
export function keepInMini(l: { id: string; type: string; "source-layer"?: string }, filters?: InsetFilters): boolean {
  if (isBase(l)) return true;
  if (!filters || (l.type !== "symbol" && l.type !== "circle")) return false;
  return pointLayerOn(l.id, filters);
}

type PointLayer = Extract<LayerSpecification, { type: "symbol" | "circle" }>;

function layerFilter(spec: LayerSpecification): FilterSpecification | null {
  if (spec.type !== "symbol" && spec.type !== "circle" && spec.type !== "line" && spec.type !== "fill") return null;
  return spec.filter ?? null;
}

/** Filter point layer as the flat inset should draw it: visible, no street-level min zoom. */
function insetPointSpec(layer: LayerSpecification, filters: InsetFilters): PointLayer | null {
  if ((layer.type !== "symbol" && layer.type !== "circle") || !pointLayerOn(layer.id, filters)) return null;
  const next = { ...layer, layout: { ...(layer.layout ?? {}), visibility: "visible" as const } } as PointLayer & { minzoom?: number };
  // Street view hides symbol layers on the main map. The switch is still on, so the inset draws them.
  delete next.minzoom;
  return next;
}

/**
 * A lightweight north-up style for the mini map, cut from the main map's
 * already-loaded style: land, water, parks, streets, flat building footprints,
 * subway lines, stations, and, when `filters` says so, the point layers those
 * Layers switches draw. No basemap name labels, no 3D, no analytics. Pure.
 */
export function miniStyle(full: StyleSpecification, filters?: InsetFilters): StyleSpecification {
  const layers = (full.layers ?? []).flatMap((l) => {
    if (isBase(l)) return [miniLayer(l)];
    const point = filters ? insetPointSpec(l, filters) : null;
    return point ? [point] : [];
  });
  const used = new Set(layers.map((l) => (l as { source?: string }).source).filter(Boolean) as string[]);
  const sources = Object.fromEntries(Object.entries(full.sources ?? {}).filter(([id]) => used.has(id)));
  return {
    version: 8,
    // Place icons and any icon text come from the basemap sprite, not from addImage.
    // maplibre rejects `undefined` for these, so only write them when the main style has them.
    ...(full.sprite ? { sprite: full.sprite } : {}),
    ...(full.glyphs ? { glyphs: full.glyphs } : {}),
    sources,
    layers,
  };
}

/** CSS rotation for the heading cone on a north-up map: the camera yaw in degrees. Pure. */
export function coneRotation(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

const FACING = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"] as const;
const SHORT = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

function octant(bearing: number): number {
  return Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
}

/** Compass phrase for the street-view inset. Pure. */
export function facingLabel(bearing: number): string {
  return `Facing ${FACING[octant(bearing)]}`;
}

/** Compass bearing in degrees from one lon/lat to another (flat approximation, fine for blocks). Pure. */
export function bearingTo(from: [number, number], to: [number, number]): number {
  const dx = (to[0] - from[0]) * Math.cos((from[1] * Math.PI) / 180);
  const dy = to[1] - from[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** "480 m NE": distance and eight-point compass for the nearest-restroom chip. Pure. */
export function whereLabel(metres: number, bearing: number): string {
  const d = metres < 950 ? `${Math.max(10, Math.round(metres / 10) * 10)} m` : `${(metres / 1000).toFixed(1)} km`;
  return `${d} ${SHORT[octant(bearing)]}`;
}

const poiIds = new WeakMap<MapLibreMap, string[]>();
const appliedSig = new WeakMap<MapLibreMap, string>();

function candidateIds(main: MapLibreMap): string[] {
  let ids = poiIds.get(main);
  if (!ids) {
    const layers = main.getStyle()?.layers;
    if (!layers) return Object.values(FILTER_POINT_LAYERS).flat();
    ids = layers.flatMap((l) => (POI_LAYERS.test(l.id) || l.id === BUS_STOP_LAYER ? [l.id] : []));
    poiIds.set(main, ids);
  }
  return [...ids, ...Object.values(FILTER_POINT_LAYERS).flat()];
}

function layerSig(main: MapLibreMap, id: string): string {
  const layer = main.getLayer(id);
  if (!layer) return `${id}:0`;
  const spec = layer.serialize();
  return `${id}:1:${JSON.stringify(layerFilter(spec))}:${JSON.stringify("paint" in spec ? spec.paint ?? null : null)}`;
}

function sourceOf(spec: LayerSpecification): string | null {
  return "source" in spec && typeof spec.source === "string" ? spec.source : null;
}

function copyIcon(mini: MapLibreMap, main: MapLibreMap, spec: LayerSpecification): void {
  if (spec.type !== "symbol") return;
  const image = spec.layout?.["icon-image"];
  if (typeof image !== "string" || mini.hasImage(image) || !main.hasImage(image)) return;
  const icon = main.getImage(image);
  mini.addImage(image, icon.data, { pixelRatio: icon.pixelRatio, sdf: icon.sdf, stretchX: icon.stretchX, stretchY: icon.stretchY, content: icon.content });
}

function ensureSource(mini: MapLibreMap, main: MapLibreMap, id: string): void {
  const src = main.getSource(id);
  if (!src) return;
  if (!mini.getSource(id)) mini.addSource(id, src.serialize() as SourceSpecification);
  if (src.type === "geojson") refreshInsetSource(mini, main, id);
}

function asGeoJson(src: { type: string } | undefined): GeoJSONSource | null {
  return src?.type === "geojson" ? (src as GeoJSONSource) : null;
}

/** Copy a geojson source the inset is already showing. Ignores vector tiles and unknown sources. */
export function refreshInsetSource(mini: MapLibreMap, main: MapLibreMap, sourceId: string): void {
  const src = asGeoJson(main.getSource(sourceId));
  if (!src || !asGeoJson(mini.getSource(sourceId))) return;
  void src.getData().then((data) => {
    try {
      void asGeoJson(mini.getSource(sourceId))?.setData(data);
    } catch {
      /* inset already removed */
    }
  }).catch(() => {});
}

/**
 * Add, update, or drop filter point layers on an existing inset.
 * Does not move the camera, so the inset stays flat and north-up.
 * `beforeId` (the live-vehicle dots) stays above the points.
 */
export function applyInsetFilters(mini: MapLibreMap, main: MapLibreMap, filters: InsetFilters, beforeId?: string): void {
  if (!mini.isStyleLoaded() || !main.isStyleLoaded()) return;
  const ids = candidateIds(main);
  const sig = `${[...filters.on].join(",")}|${filters.busStops ? 1 : 0}|${filters.placeClasses.join(",")}|${ids.map((id) => layerSig(main, id)).join("\n")}`;
  if (appliedSig.get(mini) === sig) return;
  const want = new Set(ids.filter((id) => pointLayerOn(id, filters)));
  try {
    for (const id of ids) {
      if (want.has(id) || !mini.getLayer(id)) continue;
      mini.removeLayer(id);
    }
    for (const id of want) {
      const raw = main.getLayer(id)?.serialize();
      const spec = raw ? insetPointSpec(raw, filters) : null;
      if (!spec) continue;
      const source = sourceOf(spec);
      if (source) ensureSource(mini, main, source);
      try {
        copyIcon(mini, main, spec);
      } catch {
        /* icon may still be loading */
      }
      if (!mini.getLayer(id)) mini.addLayer(spec, beforeId && mini.getLayer(beforeId) ? beforeId : undefined);
      else {
        const filter = spec.filter ?? null;
        if (JSON.stringify(mini.getFilter(id) ?? null) !== JSON.stringify(filter)) mini.setFilter(id, filter);
        if ((mini.getLayoutProperty(id, "visibility") ?? "visible") !== "visible") mini.setLayoutProperty(id, "visibility", "visible");
        const paint = spec.type === "symbol" ? spec.paint : undefined;
        if (paint && "icon-opacity" in paint) mini.setPaintProperty(id, "icon-opacity", paint["icon-opacity"]);
        if (paint && "text-opacity" in paint) mini.setPaintProperty(id, "text-opacity", paint["text-opacity"]);
      }
    }
    appliedSig.set(mini, sig);
  } catch {
    /* a source or icon may still be loading; the next style event retries */
  }
}
