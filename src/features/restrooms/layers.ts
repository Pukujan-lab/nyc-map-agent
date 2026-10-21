import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

/**
 * Public restrooms (NYC Open Data i7jb-7jku, ingested into Octo core.restrooms)
 * as one MapLibre symbol layer. The city-wide list from /api/restrooms is
 * fetched once; only the closest few to the map centre are drawn.
 * Click opens a small card; there is no hover tooltip.
 */
export const RESTROOMS_LAYER = "restrooms";
const SOURCE = "restrooms";
const ICON = "restroom-icon";

export interface RestroomInfo {
  name: string;
  status: string | null;
  hours: string | null;
  accessibility: string | null;
  operator: string | null;
}

/** A plain "WC" disc drawn once on a canvas: no icon font, no SVG asset. */
function restroomIcon(): ImageData {
  const size = 44;
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d canvas");
  ctx.canvas.width = ctx.canvas.height = size;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = "#2563eb";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("WC", size / 2, size / 2 + 1);
  return ctx.getImageData(0, 0, size, size);
}

/** How many restrooms are shown: the closest few to the map centre. */
export const NEAREST_COUNT = 5;
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Rough metres between two lon/lat points (equirectangular; fine at city scale). */
function metres(a: [number, number], b: [number, number]): number {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (a[0] - b[0]) * k * 111_320;
  const dy = (a[1] - b[1]) * 110_540;
  return Math.hypot(dx, dy);
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
    scored.push([metres(center, [lon, lat]), f]);
  }
  scored.sort((x, y) => x[0] - y[0]);
  return { type: "FeatureCollection", features: scored.slice(0, n).map(([, f]) => f) };
}

let cityWide: Promise<GeoJSON.FeatureCollection> | null = null;
const wired = new WeakSet<MapLibreMap>();

/** Re-pick the nearest few whenever the map stops moving. */
function wireNearest(map: MapLibreMap): void {
  if (wired.has(map)) return;
  wired.add(map);
  cityWide ??= fetch(`${window.location.origin}/api/restrooms`)
    .then((r) => (r.ok ? (r.json() as Promise<GeoJSON.FeatureCollection>) : EMPTY))
    .catch(() => EMPTY);
  const update = () => {
    void cityWide!.then((all) => {
      const src = map.getSource<GeoJSONSource>(SOURCE);
      const c = map.getCenter();
      src?.setData(nearestRestrooms(all, [c.lng, c.lat]));
    });
  };
  map.on("moveend", update);
  map.on("styledata", () => { if (map.getSource(SOURCE)) update(); });
  update();
}

/** Adds source + layer once per style; safe to call after every style load. */
export function installRestrooms(map: MapLibreMap): void {
  if (!map.hasImage(ICON)) map.addImage(ICON, restroomIcon(), { pixelRatio: 2 });
  if (!map.getSource(SOURCE)) {
    map.addSource(SOURCE, {
      type: "geojson",
      data: EMPTY,
      attribution: "NYC Open Data (Public Restrooms)",
    });
  }
  wireNearest(map);
  if (map.getLayer(RESTROOMS_LAYER)) return;
  map.addLayer({
    id: RESTROOMS_LAYER,
    type: "symbol",
    source: SOURCE,
    minzoom: 11,
    layout: {
      "icon-image": ICON,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 16, 1],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
}

export function setRestroomsVisible(map: MapLibreMap, on: boolean): void {
  if (map.getLayer(RESTROOMS_LAYER)) map.setLayoutProperty(RESTROOMS_LAYER, "visibility", on ? "visible" : "none");
}

/** The restroom under a click, if the layer is showing. */
export function restroomAt(map: MapLibreMap, x: number, y: number): RestroomInfo | null {
  if (!map.getLayer(RESTROOMS_LAYER)) return null;
  const f = map.queryRenderedFeatures([[x - 8, y - 8], [x + 8, y + 8]], { layers: [RESTROOMS_LAYER] })[0];
  if (!f) return null;
  const p = f.properties as Record<string, unknown>;
  const s = (k: string) => (typeof p[k] === "string" && p[k] ? (p[k]) : null);
  return { name: s("name") ?? "Public restroom", status: s("status"), hours: s("hours"), accessibility: s("accessibility"), operator: s("operator") };
}
