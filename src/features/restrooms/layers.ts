import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { drawRestroomPictogram } from "@/lib/map/restroomPictogram";
import { eyeOrCenter } from "@/lib/map/streetPick";

/**
 * Public restrooms (NYC Open Data i7jb-7jku merged server-side with OpenStreetMap
 * public toilets) as one MapLibre symbol layer. The city-wide list from /api/restrooms is
 * fetched once. City and neighbourhood zoom draw a spread across the view so
 * the open map is not five dots at the centre. Street zoom (17 and closer)
 * keeps the restrooms within a few blocks, which is what the 3D kiosks can
 * draw. Click opens a small card; there is no hover tooltip.
 */
export const RESTROOMS_LAYER = "restrooms";
const SOURCE = "restrooms";
const ICON = "restroom-icon";
/** Inset map layer. Separate source so the street camera's cap does not empty it. */
export const MINI_RESTROOMS_LAYER = "mini-restrooms";
const MINI_SOURCE = "mini-restrooms";
/** The 3D vehicle layer stays above these icons. It moves itself to the top. */
const VEHICLES_LAYER = "three-vehicles";

export interface RestroomInfo {
  name: string;
  status: string | null;
  hours: string | null;
  accessibility: string | null;
  operator: string | null;
  lon: number;
  lat: number;
  /** Which list the record comes from (/api/restrooms merges NYC Open Data and OpenStreetMap). */
  source?: "nyc-open-data" | "openstreetmap";
  /** When that source last updated the record (ISO). */
  asOf?: string | null;
  fee?: boolean | null;
  changingTable?: boolean | null;
  unisex?: boolean | null;
  /** City fields filled from a matched OpenStreetMap toilet. */
  filledFromOsm?: string[];
}

const RESTROOM_ATTRIBUTION = "NYC Open Data (Public Restrooms), © OpenStreetMap contributors";
const INK = "#121212";
const CHARTREUSE = "#c6f702";

/** A chartreuse disc with an ink ring and the restroom pictogram: readable on pale land and over bus badges. */
function restroomIcon(): ImageData {
  const size = 64;
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d canvas");
  ctx.canvas.width = ctx.canvas.height = size;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = CHARTREUSE;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  drawRestroomPictogram(ctx, size / 2, size / 2, 36, INK);
  return ctx.getImageData(0, 0, size, size);
}

/** How many restrooms are shown at neighbourhood zoom when the caller has no view bounds. */
export const NEAREST_COUNT = 5;
/** Icons on the open map: a spread across the view, not a pile at the centre. */
export const VIEW_CAP = 40;
/** First zoom the icons draw. The opening view is about 11, so they are on screen. */
export const RESTROOM_MIN_ZOOM = 11;
/** Street zoom matches the 3D kiosk layer. */
export const STREET_ZOOM = 17;
/** A bit past the kiosk draw radius so the next block is already in the source. */
export const STREET_RADIUS_M = 300;
/** Same cap as the kiosk meshes. */
export const STREET_CAP = 24;
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export interface LngLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Rough metres between two lon/lat points (equirectangular; fine at city scale). */
export function metresBetween(a: [number, number], b: [number, number]): number {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (a[0] - b[0]) * k * 111_320;
  const dy = (a[1] - b[1]) * 110_540;
  return Math.hypot(dx, dy);
}

/** Walking distance for a sheet subtitle. */
export function formatMetres(m: number): string {
  if (!Number.isFinite(m)) return "";
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** The `n` point features closest to `center`, nearest first. */
export function nearestRestrooms(
  all: GeoJSON.FeatureCollection,
  center: [number, number],
  n = NEAREST_COUNT,
): GeoJSON.FeatureCollection {
  const scored: Array<[number, GeoJSON.Feature]> = [];
  for (const f of all.features) {
    if (f.geometry?.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    scored.push([metresBetween(center, [lon, lat]), f]);
  }
  scored.sort((x, y) => x[0] - y[0]);
  return { type: "FeatureCollection", features: scored.slice(0, n).map(([, f]) => f) };
}

function inBounds(lon: number, lat: number, bounds: LngLatBounds): boolean {
  return lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north;
}

/**
 * Restrooms inside the view, nearest to the centre first. When the view holds
 * more than `cap`, one from each cell of a grid so the edges are not empty.
 */
export function spreadRestrooms(
  all: GeoJSON.FeatureCollection,
  bounds: LngLatBounds,
  center: [number, number],
  cap: number,
): GeoJSON.FeatureCollection {
  const inside: GeoJSON.Feature[] = [];
  for (const f of all.features) {
    if (f.geometry?.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    if (inBounds(lon, lat, bounds)) inside.push(f);
  }
  const byCentre = (a: GeoJSON.Feature, b: GeoJSON.Feature) => {
    const pa = (a.geometry as GeoJSON.Point).coordinates as [number, number];
    const pb = (b.geometry as GeoJSON.Point).coordinates as [number, number];
    return metresBetween(center, pa) - metresBetween(center, pb);
  };
  if (inside.length <= cap) return { type: "FeatureCollection", features: inside.sort(byCentre) };
  const lonSpan = Math.max(bounds.east - bounds.west, 1e-9);
  const latSpan = Math.max(bounds.north - bounds.south, 1e-9);
  const cols = Math.max(1, Math.round(Math.sqrt(cap * (lonSpan / latSpan))));
  const rows = Math.max(1, Math.ceil(cap / cols));
  const picked: GeoJSON.Feature[] = [];
  const used = new Set<GeoJSON.Feature>();
  for (let r = 0; r < rows && picked.length < cap; r++) {
    for (let c = 0; c < cols && picked.length < cap; c++) {
      const west = bounds.west + (lonSpan * c) / cols;
      const east = bounds.west + (lonSpan * (c + 1)) / cols;
      const south = bounds.south + (latSpan * r) / rows;
      const north = bounds.south + (latSpan * (r + 1)) / rows;
      const mid: [number, number] = [(west + east) / 2, (south + north) / 2];
      let best: GeoJSON.Feature | null = null;
      let bestD = Infinity;
      for (const f of inside) {
        if (used.has(f)) continue;
        const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        const onEast = c === cols - 1 ? lon > east : lon >= east;
        const onNorth = r === rows - 1 ? lat > north : lat >= north;
        if (lon < west || onEast || lat < south || onNorth) continue;
        const d = metresBetween(mid, [lon, lat]);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      if (best) {
        used.add(best);
        picked.push(best);
      }
    }
  }
  inside.sort(byCentre);
  for (const f of inside) {
    if (picked.length >= cap) break;
    if (!used.has(f)) picked.push(f);
  }
  return { type: "FeatureCollection", features: picked.sort(byCentre) };
}

/**
 * What the restroom source should hold. Neighbourhood zoom spreads icons across
 * the view. Street zoom holds every restroom within {@link STREET_RADIUS_M},
 * capped, so a walk shows the block in front of you.
 */
export function restroomsForView(
  all: GeoJSON.FeatureCollection,
  center: [number, number],
  zoom: number,
  bounds?: LngLatBounds,
): GeoJSON.FeatureCollection {
  if (zoom < STREET_ZOOM) return bounds ? spreadRestrooms(all, bounds, center, VIEW_CAP) : nearestRestrooms(all, center);
  const near = nearestRestrooms(all, center, STREET_CAP);
  return {
    type: "FeatureCollection",
    features: near.features.filter((f) => {
      if (f.geometry?.type !== "Point") return false;
      const [lon, lat] = f.geometry.coordinates as [number, number];
      return metresBetween(center, [lon, lat]) <= STREET_RADIUS_M;
    }),
  };
}

export function restroomInfo(f: GeoJSON.Feature): RestroomInfo | null {
  if (f.geometry?.type !== "Point") return null;
  const [lon, lat] = f.geometry.coordinates as [number, number];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof p[k] === "string" && p[k] ? p[k] : null);
  const b = (k: string) => (typeof p[k] === "boolean" ? p[k] : null);
  return {
    name: s("name") ?? "Public restroom",
    status: s("status"),
    hours: s("hours"),
    accessibility: s("accessibility"),
    operator: s("operator"),
    lon,
    lat,
    source: p.source === "openstreetmap" ? "openstreetmap" : "nyc-open-data",
    asOf: s("asOf"),
    fee: b("fee"),
    changingTable: b("changingTable"),
    unisex: b("unisex"),
    filledFromOsm: stringList(p.filledFromOsm),
  };
}

/** A string-array property; MapLibre hands a rendered feature's arrays back as JSON text. */
function stringList(v: unknown): string[] {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return [];
    }
  }
  return Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : [];
}

/** The single closest restroom, with the walking distance. */
export function closestRestroom(
  all: GeoJSON.FeatureCollection,
  center: [number, number],
): { info: RestroomInfo; metres: number } | null {
  const f = nearestRestrooms(all, center, 1).features[0];
  if (!f) return null;
  const info = restroomInfo(f);
  if (!info) return null;
  return { info, metres: metresBetween(center, [info.lon, info.lat]) };
}

/** Where the restroom layer should sit: above bus badges, under the 3D vehicles. */
export function restroomAnchor(order: readonly string[]): "top" | "before-vehicles" | "stay" {
  const me = order.indexOf(RESTROOMS_LAYER);
  if (me < 0) return "stay";
  const vehicles = order.indexOf(VEHICLES_LAYER);
  if (vehicles >= 0) return me === vehicles - 1 ? "stay" : "before-vehicles";
  return me === order.length - 1 ? "stay" : "top";
}

function raiseRestrooms(map: MapLibreMap): void {
  if (!map.getLayer(RESTROOMS_LAYER)) return;
  const slot = restroomAnchor(map.getLayersOrder());
  if (slot === "stay") return;
  if (slot === "before-vehicles" && map.getLayer(VEHICLES_LAYER)) map.moveLayer(RESTROOMS_LAYER, VEHICLES_LAYER);
  else map.moveLayer(RESTROOMS_LAYER);
}

function restroomKey(f: GeoJSON.Feature): string {
  if (f.geometry?.type !== "Point") return "";
  const [lon, lat] = f.geometry.coordinates as [number, number];
  const name = typeof f.properties?.name === "string" ? f.properties.name : "";
  return `${name}@${lon.toFixed(5)},${lat.toFixed(5)}`;
}

let cityWide: Promise<GeoJSON.FeatureCollection> | null = null;
const wired = new WeakSet<MapLibreMap>();

/** The city-wide list, fetched once per page. */
export function loadRestrooms(): Promise<GeoJSON.FeatureCollection> {
  cityWide ??= fetch(`${window.location.origin}/api/restrooms`)
    .then((r) => (r.ok ? (r.json() as Promise<GeoJSON.FeatureCollection>) : EMPTY))
    .catch(() => EMPTY);
  return cityWide;
}

function viewBounds(map: MapLibreMap): LngLatBounds {
  const b = map.getBounds();
  return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
}

/** Re-pick whenever the map stops moving. Skip the write when the same restrooms are already showing. */
function wireNearest(map: MapLibreMap): void {
  if (wired.has(map)) return;
  wired.add(map);
  let shown = "";
  let at = { lng: 0, lat: 0 };
  let atZoom = -1;
  let dirty = true;
  const update = () => {
    // Around the viewer: at street level the centre is far down the look ray.
    const c = eyeOrCenter(map);
    const z = map.getZoom();
    // A look does not move the eye. Skip the city-wide sort until it does, or the style reloads.
    if (!dirty && Math.abs(z - atZoom) < 0.05 && metresBetween([c.lng, c.lat], [at.lng, at.lat]) < 15) return;
    dirty = false;
    at = { lng: c.lng, lat: c.lat };
    atZoom = z;
    void loadRestrooms().then((all) => {
      const src = map.getSource<GeoJSONSource>(SOURCE);
      if (!src) return;
      const next = restroomsForView(all, [c.lng, c.lat], z, viewBounds(map));
      const key = next.features.map(restroomKey).join("|");
      if (key === shown) return;
      shown = key;
      void src.setData(next);
    });
  };
  const lift = () => {
    if (!map.getLayer(RESTROOMS_LAYER)) return;
    raiseRestrooms(map);
  };
  map.on("moveend", update);
  map.on("idle", lift);
  map.on("styledata", () => {
    lift();
    if (!map.getSource(SOURCE)) return;
    dirty = true;
    update();
  });
  update();
}

const ICON_LAYOUT = {
  "icon-image": ICON,
  "icon-size": ["interpolate", ["linear"], ["zoom"], RESTROOM_MIN_ZOOM, 0.85, 14, 1.15, 17, 1.35] as unknown as number,
  "icon-pitch-alignment": "viewport" as const,
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
};

/** Adds source + layer once per style; safe to call after every style load. */
export function installRestrooms(map: MapLibreMap): void {
  if (!map.hasImage(ICON)) map.addImage(ICON, restroomIcon(), { pixelRatio: 2 });
  if (!map.getSource(SOURCE)) {
    map.addSource(SOURCE, {
      type: "geojson",
      data: EMPTY,
      attribution: RESTROOM_ATTRIBUTION,
    });
  }
  wireNearest(map);
  if (!map.getLayer(RESTROOMS_LAYER)) {
    map.addLayer({
      id: RESTROOMS_LAYER,
      type: "symbol",
      source: SOURCE,
      minzoom: RESTROOM_MIN_ZOOM,
      layout: ICON_LAYOUT,
    });
  }
  raiseRestrooms(map);
}

export function setRestroomsVisible(map: MapLibreMap, on: boolean): void {
  if (map.getLayer(RESTROOMS_LAYER)) map.setLayoutProperty(RESTROOMS_LAYER, "visibility", on ? "visible" : "none");
}

/** Restroom icons for the street-view inset. The caller fills the source. */
export function mountMiniRestrooms(map: MapLibreMap): void {
  if (!map.hasImage(ICON)) map.addImage(ICON, restroomIcon(), { pixelRatio: 2 });
  if (!map.getSource(MINI_SOURCE)) map.addSource(MINI_SOURCE, { type: "geojson", data: EMPTY, attribution: RESTROOM_ATTRIBUTION });
  if (!map.getLayer(MINI_RESTROOMS_LAYER)) {
    map.addLayer({
      id: MINI_RESTROOMS_LAYER,
      type: "symbol",
      source: MINI_SOURCE,
      layout: {
        "icon-image": ICON,
        "icon-size": 1,
        "icon-pitch-alignment": "viewport",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
}

export function setMiniRestrooms(map: MapLibreMap, data: GeoJSON.FeatureCollection): void {
  const src = map.getSource<GeoJSONSource>(MINI_SOURCE);
  void src?.setData(data);
}

/** The restroom under a click, if the layer is showing. */
export function restroomAt(map: MapLibreMap, x: number, y: number): RestroomInfo | null {
  if (!map.getLayer(RESTROOMS_LAYER)) return null;
  const f = map.queryRenderedFeatures([[x - 16, y - 16], [x + 16, y + 16]], { layers: [RESTROOMS_LAYER] })[0];
  return f ? restroomInfo(f) : null;
}
