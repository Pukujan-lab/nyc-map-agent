import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { getAmbient, subscribeAmbient } from "@/lib/ambient";
import { fetchHazards, type HazardsData } from "./data";

/**
 * Hazards on the map: warning areas as a soft hatched tint with a small "!"
 * badge, wet FloodNet sensors as pulsing blue dots, and at street level a
 * shallow water plane (a 0.15 m extrusion, gently breathing) at each wet
 * sensor. Eco mode stops the animation.
 */
const SRC_AREAS = "hazards-areas";
const SRC_SENSORS = "hazards-sensors";
const SRC_WATER = "hazards-water";
const HATCH = "hazards-hatch";
const BADGE = "hazards-badge-icon";

function hatch(): ImageData {
  const s = 16;
  const g = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  g.canvas.width = g.canvas.height = s;
  g.strokeStyle = "rgba(245, 158, 11, 0.55)";
  g.lineWidth = 2;
  for (const o of [-s, 0, s]) {
    g.beginPath();
    g.moveTo(o, s);
    g.lineTo(o + s, 0);
    g.stroke();
  }
  return g.getImageData(0, 0, s, s);
}

function badge(): ImageData {
  const s = 36;
  const g = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  g.canvas.width = g.canvas.height = s;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
  g.fillStyle = "#f59e0b";
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = "#ffffff";
  g.stroke();
  g.fillStyle = "#1f2937";
  g.font = "bold 20px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("!", s / 2, s / 2 + 1);
  return g.getImageData(0, 0, s, s);
}

/** A point inside-ish the first ring: its vertex average. */
function labelPoint(geom: GeoJSON.Geometry): [number, number] | null {
  const ring = (g: GeoJSON.Geometry): GeoJSON.Position[] | null =>
    g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : g.type === "GeometryCollection" && g.geometries[0] ? ring(g.geometries[0]) : null;
  const r = ring(geom);
  if (!r?.length) return null;
  return [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];
}

/** ~6 m square around a sensor, for the street-level water plane. */
function puddle(lon: number, lat: number, m = 6): GeoJSON.Polygon {
  const dLat = m / 111_320;
  const dLon = m / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { type: "Polygon", coordinates: [[[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]]] };
}

function toGeo(data: HazardsData) {
  const areas: GeoJSON.Feature[] = [];
  for (const a of data.alerts) {
    if (!a.geometry) continue;
    const g = a.geometry as GeoJSON.Geometry;
    areas.push({ type: "Feature", properties: { kind: "area", event: a.event }, geometry: g });
    const p = labelPoint(g);
    if (p) areas.push({ type: "Feature", properties: { kind: "badge" }, geometry: { type: "Point", coordinates: p } });
  }
  return {
    areas: { type: "FeatureCollection" as const, features: areas },
    sensors: {
      type: "FeatureCollection" as const,
      features: data.sensors.map((s) => ({ type: "Feature" as const, properties: { depth: s.depthMm }, geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] } })),
    },
    water: {
      type: "FeatureCollection" as const,
      features: data.sensors.map((s) => ({ type: "Feature" as const, properties: {}, geometry: puddle(s.lon, s.lat) })),
    },
  };
}

export function mount(map: MapLibreMap): () => void {
  const empty = { type: "FeatureCollection" as const, features: [] };
  if (!map.hasImage(HATCH)) map.addImage(HATCH, hatch());
  if (!map.hasImage(BADGE)) map.addImage(BADGE, badge(), { pixelRatio: 2 });
  for (const id of [SRC_AREAS, SRC_SENSORS, SRC_WATER]) if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty });
  const before = (map.getStyle().layers ?? []).find((l) => l.type === "symbol")?.id;
  const add = (layer: Parameters<MapLibreMap["addLayer"]>[0], beforeId?: string) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, beforeId);
  };
  add({ id: "hazards-tint", type: "fill", source: SRC_AREAS, filter: ["==", ["get", "kind"], "area"], paint: { "fill-color": "#f59e0b", "fill-opacity": 0.08 } }, before);
  add({ id: "hazards-hatch", type: "fill", source: SRC_AREAS, filter: ["==", ["get", "kind"], "area"], paint: { "fill-pattern": HATCH, "fill-opacity": 0.6 } }, before);
  add({ id: "hazards-edge", type: "line", source: SRC_AREAS, filter: ["==", ["get", "kind"], "area"], paint: { "line-color": "#d97706", "line-width": 1.2, "line-opacity": 0.7 } }, before);
  add({ id: "hazards-water", type: "fill-extrusion", source: SRC_WATER, minzoom: 16, paint: { "fill-extrusion-color": "#3b82f6", "fill-extrusion-height": 0.15, "fill-extrusion-opacity": 0.55 } });
  add({ id: "hazards-pulse", type: "circle", source: SRC_SENSORS, paint: { "circle-color": "#3b82f6", "circle-opacity": 0.25, "circle-radius": 10 } });
  add({ id: "hazards-sensors", type: "circle", source: SRC_SENSORS, paint: { "circle-color": "#2563eb", "circle-radius": 5, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } });
  add({ id: "hazards-badge", type: "symbol", source: SRC_AREAS, filter: ["==", ["get", "kind"], "badge"], layout: { "icon-image": BADGE, "icon-allow-overlap": true } });

  const load = async () => {
    try {
      const g = toGeo(await fetchHazards());
      (map.getSource(SRC_AREAS) as GeoJSONSource | undefined)?.setData(g.areas);
      (map.getSource(SRC_SENSORS) as GeoJSONSource | undefined)?.setData(g.sensors);
      (map.getSource(SRC_WATER) as GeoJSONSource | undefined)?.setData(g.water);
    } catch {
      /* the feed is best-effort */
    }
  };
  void load();
  const timer = window.setInterval(() => void load(), 5 * 60_000);

  // Pulse: ~12 fps paint updates, not a per-frame loop. Eco: static.
  let raf = 0;
  let lastTick = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (now - lastTick < 80 || !map.getLayer("hazards-pulse")) return;
    lastTick = now;
    const k = (now % 1600) / 1600;
    map.setPaintProperty("hazards-pulse", "circle-radius", 6 + 16 * k);
    map.setPaintProperty("hazards-pulse", "circle-opacity", 0.35 * (1 - k));
    map.setPaintProperty("hazards-water", "fill-extrusion-opacity", 0.45 + 0.12 * Math.sin(now / 500));
  };
  const sync = () => {
    cancelAnimationFrame(raf);
    if (!getAmbient().eco) raf = requestAnimationFrame(tick);
  };
  sync();
  const unsub = subscribeAmbient(sync);

  return () => {
    unsub();
    cancelAnimationFrame(raf);
    window.clearInterval(timer);
    for (const id of ["hazards-badge", "hazards-sensors", "hazards-pulse", "hazards-water", "hazards-edge", "hazards-hatch", "hazards-tint"]) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of [SRC_AREAS, SRC_SENSORS, SRC_WATER]) if (map.getSource(id)) map.removeSource(id);
  };
}
