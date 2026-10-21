import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { LngLatTuple, Trip } from "./schema";

/** The planned trip as MapLibre line/circle layers on one GeoJSON source, plus a moving marker. */
const SRC = "agent-trip";
const MARKER = "agent-marker";

/** Official MTA bullet colours (mta.info brand guide), by route id. */
const ROUTE_COLOR: Record<string, string> = {
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E", "4": "#00933C", "5": "#00933C", "6": "#00933C", "7": "#B933AD",
  A: "#0039A6", C: "#0039A6", E: "#0039A6", B: "#FF6319", D: "#FF6319", F: "#FF6319", M: "#FF6319", G: "#6CBE45",
  J: "#996633", Z: "#996633", L: "#A7A9AC", N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A", S: "#808183",
};

function ensure(map: MapLibreMap): void {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource(MARKER, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "agent-walk", type: "line", source: SRC, filter: ["==", ["get", "kind"], "walk"], paint: { "line-color": "#2563eb", "line-width": 4, "line-dasharray": [1, 1.5] } });
  map.addLayer({ id: "agent-drive", type: "line", source: SRC, filter: ["==", ["get", "kind"], "drive"], paint: { "line-color": "#2563eb", "line-width": 6, "line-opacity": 0.85 } });
  map.addLayer({ id: "agent-ride", type: "line", source: SRC, filter: ["==", ["get", "kind"], "ride"], paint: { "line-color": ["get", "color"], "line-width": 6 } });
  map.addLayer({ id: "agent-portal", type: "circle", source: SRC, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#111827", "circle-stroke-width": 2 } });
  map.addLayer({ id: "agent-marker", type: "circle", source: MARKER, paint: { "circle-radius": 8, "circle-color": ["coalesce", ["get", "color"], "#2563eb"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
}

export function tripToGeoJson(trip: Trip): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const l of trip.legs) {
    if (l.kind === "enter" || l.kind === "exit") {
      features.push({ type: "Feature", properties: { kind: l.kind }, geometry: { type: "Point", coordinates: [l.portal.lon, l.portal.lat] } });
    } else {
      const kind = l.kind === "transfer" ? "walk" : l.kind;
      const color = l.kind === "ride" ? ROUTE_COLOR[l.route] ?? "#808183" : null;
      features.push({ type: "Feature", properties: { kind, color }, geometry: { type: "LineString", coordinates: l.coords } });
    }
  }
  return { type: "FeatureCollection", features };
}

export function showTrip(map: MapLibreMap, trip: Trip): void {
  ensure(map);
  (map.getSource(SRC) as GeoJSONSource).setData(tripToGeoJson(trip));
  const all = trip.legs.flatMap((l) => ("coords" in l ? l.coords : [[l.portal.lon, l.portal.lat] as LngLatTuple]));
  const lons = all.map((c) => c[0]);
  const lats = all.map((c) => c[1]);
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 80, pitch: 0, bearing: 0, duration: 800 });
}

export function setMarker(map: MapLibreMap, at: LngLatTuple | null, route?: string): void {
  ensure(map);
  (map.getSource(MARKER) as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: at ? [{ type: "Feature", properties: { color: route ? ROUTE_COLOR[route] ?? null : null }, geometry: { type: "Point", coordinates: at } }] : [],
  });
}

const saved = new Map<string, unknown>();
/** Ghost / x-ray: fade every extruded-building layer while the preview is underground. */
export function setXray(map: MapLibreMap, on: boolean): void {
  const ids = (map.getStyle()?.layers ?? []).filter((l) => l.type === "fill-extrusion" && /building/i.test(l.id)).map((l) => l.id);
  for (const id of ids) {
    if (on) {
      if (!saved.has(id)) saved.set(id, map.getPaintProperty(id, "fill-extrusion-opacity") ?? 1);
      map.setPaintProperty(id, "fill-extrusion-opacity", 0.18);
    } else if (saved.has(id)) {
      map.setPaintProperty(id, "fill-extrusion-opacity", saved.get(id) as number);
      saved.delete(id);
    }
  }
}

const dimmed = new Map<string, unknown>();
/** While previewing, fade the data columns (not buildings) so the street stays visible. */
export function setPreviewDim(map: MapLibreMap, on: boolean): void {
  const ids = (map.getStyle()?.layers ?? []).filter((l) => l.type === "fill-extrusion" && !/building/i.test(l.id)).map((l) => l.id);
  for (const id of ids) {
    if (on && !dimmed.has(id)) {
      dimmed.set(id, map.getPaintProperty(id, "fill-extrusion-opacity") ?? 1);
      map.setPaintProperty(id, "fill-extrusion-opacity", 0.12);
    } else if (!on && dimmed.has(id)) {
      map.setPaintProperty(id, "fill-extrusion-opacity", dimmed.get(id) as number);
      dimmed.delete(id);
    }
  }
}
