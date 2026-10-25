import { createElement } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { pushPanel } from "@/lib/store/PanelContext";
import { fetchEvents, KIND_LABEL, pinAt, type EventFeature } from "./data";
import { EventSheet } from "./EventSheet";
import { formatWhen, getWindow, isHappeningNow, subscribeWindow } from "./window";

/**
 * Events as ivory pins with a thick ink ring — bigger than bus stops and
 * readable at city zoom — filled chartreuse when happening now; closed blocks also get a thin dashed ink line. Mounted only
 * while the Events chip is on (MapView, `on=events`). Tap opens the event sheet
 * through the public pushPanel API. No hover tooltip.
 */
const SRC_PINS = "events-pins";
const SRC_LINES = "events-lines";
const EVENT_LAYERS = ["events-pin", "events-now"] as const;
const INK = "#121212";
const CHARTREUSE = "#c6f702";
const IVORY = "#F2F1ED";
/** Pin radius by zoom: ~6 px at city zoom (bus stops are ~4), 10 px close up. */
export const PIN_RADIUS = ["interpolate", ["linear"], ["zoom"], 10, 5, 12, 6.5, 16, 10] as const;
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Pins (with `now`) and block lines for MapLibre. */
export function toCollections(events: EventFeature[], now = Date.now()): { pins: GeoJSON.FeatureCollection; lines: GeoJSON.FeatureCollection } {
  return {
    pins: {
      type: "FeatureCollection",
      features: events.map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: pinAt(f) },
        properties: { ...f.properties, now: isHappeningNow(f.properties.start, f.properties.end, now) },
      })),
    },
    lines: { type: "FeatureCollection", features: events.filter((f) => f.geometry.type === "LineString") },
  };
}

export function mount(map: MapLibreMap): () => void {
  let events: EventFeature[] = [];
  let alive = true;
  const render = () => {
    const { pins, lines } = toCollections(events);
    void map.getSource<GeoJSONSource>(SRC_PINS)?.setData(pins);
    void map.getSource<GeoJSONSource>(SRC_LINES)?.setData(lines);
  };
  const load = () => void fetchEvents(getWindow()).then((f) => { if (alive) { events = f; render(); } }).catch(() => {});

  const attribution = "NYC Open Data (Permitted Events, Parks Events, CSCL)";
  if (!map.getSource(SRC_PINS)) map.addSource(SRC_PINS, { type: "geojson", data: EMPTY, attribution });
  if (!map.getSource(SRC_LINES)) map.addSource(SRC_LINES, { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "events-line",
    type: "line",
    source: SRC_LINES,
    minzoom: 13,
    paint: { "line-color": INK, "line-width": 2, "line-dasharray": [2, 1.5], "line-opacity": 0.7 },
  });
  map.addLayer({
    id: "events-pin",
    type: "circle",
    source: SRC_PINS,
    minzoom: 10,
    paint: {
      "circle-color": ["case", ["==", ["get", "now"], true], CHARTREUSE, IVORY],
      "circle-radius": PIN_RADIUS as never,
      "circle-stroke-color": INK,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 3],
    },
  });
  map.addLayer({
    id: "events-now",
    type: "circle",
    source: SRC_PINS,
    minzoom: 10,
    filter: ["==", ["get", "now"], true],
    // Happening now: a small ink centre on the chartreuse pin, so it reads without colour too.
    paint: { "circle-color": INK, "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 16, 3] },
  });

  const onClick = (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    const f = events.find((x) => x.properties.id === id);
    if (!f) return;
    const p = f.properties;
    const [lon, lat] = pinAt(f);
    pushPanel({
      id: `event:${p.id}`,
      title: p.title,
      subtitle: KIND_LABEL[p.kind],
      summary: formatWhen(p.start, p.end),
      details: createElement(EventSheet, { event: p, lon, lat }),
    });
  };
  const pointer = () => (map.getCanvas().style.cursor = "pointer");
  const unpointer = () => (map.getCanvas().style.cursor = "");
  for (const id of EVENT_LAYERS) {
    map.on("click", id, onClick);
    map.on("mouseenter", id, pointer);
    map.on("mouseleave", id, unpointer);
  }
  const unsub = subscribeWindow(load);
  const tick = window.setInterval(render, 60_000); // keep "happening now" honest
  load();

  return () => {
    alive = false;
    unsub();
    window.clearInterval(tick);
    for (const id of EVENT_LAYERS) {
      map.off("click", id, onClick);
      map.off("mouseenter", id, pointer);
      map.off("mouseleave", id, unpointer);
    }
    for (const id of ["events-now", "events-pin", "events-line"]) if (map.getLayer(id)) map.removeLayer(id);
    for (const s of [SRC_PINS, SRC_LINES]) if (map.getSource(s)) map.removeSource(s);
  };
}
