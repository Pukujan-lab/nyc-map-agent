import { createElement } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, MapMouseEvent } from "maplibre-gl";
import { kioskSources, pickAt } from "@/lib/map/streetPick";
import { pushPanel } from "@/lib/store/PanelContext";
import { ACCESS_LABEL, fetchPlaceToilets, KIND_LABEL, MIN_ZOOM, type PlaceToiletFeature } from "./data";
import { PlaceToiletSheet } from "./PlaceToiletSheet";
import { isShopsEnabled, subscribeShops } from "./store";

/**
 * Shops & cafés with a toilet: small, calm stone-grey dots (white ring; a
 * green ring for "Anyone") from zoom 15, under the blue public-restroom "WC"
 * discs, which stay primary. Data is fetched only once the chip is on.
 */
const SRC = "place-toilets";
const PLACE_TOILETS_LAYER = "place-toilets";
const STONE = "#78716c";
const ANYONE_RING = "#059669";
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function toCollection(places: PlaceToiletFeature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: places };
}

export function mount(map: MapLibreMap): () => void {
  let places: PlaceToiletFeature[] = [];
  let alive = true;
  if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: EMPTY, attribution: "© OpenStreetMap contributors (ODbL)" });
  map.addLayer(
    {
      id: PLACE_TOILETS_LAYER,
      type: "circle",
      source: SRC,
      minzoom: MIN_ZOOM,
      layout: { visibility: "none" },
      paint: {
        "circle-color": STONE,
        "circle-opacity": 0.85,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 4, 18, 6],
        "circle-stroke-color": ["match", ["get", "access"], "anyone", ANYONE_RING, "#ffffff"],
        "circle-stroke-width": 1.5,
      },
    },
    map.getLayer("restrooms") ? "restrooms" : undefined,
  );

  const apply = (on: boolean) => {
    kioskSources.places = on;
    if (!alive || !map.getLayer(PLACE_TOILETS_LAYER)) return;
    map.setLayoutProperty(PLACE_TOILETS_LAYER, "visibility", on ? "visible" : "none");
    if (on && !places.length) {
      void fetchPlaceToilets().then((p) => {
        if (!alive) return;
        places = p;
        map.getSource<GeoJSONSource>(SRC)?.setData(toCollection(p));
      });
    }
  };

  const open = (f: PlaceToiletFeature) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    pushPanel({
      id: `place-toilet:${p.id}`,
      title: p.name,
      subtitle: `${KIND_LABEL[p.kind] ?? "Place"} with toilet`,
      summary: `${ACCESS_LABEL[p.access]}${p.wheelchair ? " · ♿ wheelchair accessible" : ""}`,
      details: createElement(PlaceToiletSheet, { place: p, lon, lat }),
    });
  };
  const onClick = (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    const f = places.find((x) => x.properties.id === id);
    if (f) open(f);
  };
  // The 3D kiosk for a place at street level opens the same sheet.
  const onKiosk = (e: MapMouseEvent) => {
    const k = pickAt(map, e.point.x, e.point.y);
    if (k?.kind !== "place") return;
    const f = places.find((x) => x.properties.id === k.id);
    if (f) open(f);
  };
  const pointer = () => (map.getCanvas().style.cursor = "pointer");
  const unpointer = () => (map.getCanvas().style.cursor = "");
  map.on("click", PLACE_TOILETS_LAYER, onClick);
  map.on("click", onKiosk);
  map.on("mouseenter", PLACE_TOILETS_LAYER, pointer);
  map.on("mouseleave", PLACE_TOILETS_LAYER, unpointer);
  const unsub = subscribeShops(apply);
  apply(isShopsEnabled());

  return () => {
    alive = false;
    unsub();
    map.off("click", PLACE_TOILETS_LAYER, onClick);
    map.off("click", onKiosk);
    map.off("mouseenter", PLACE_TOILETS_LAYER, pointer);
    map.off("mouseleave", PLACE_TOILETS_LAYER, unpointer);
    if (map.getLayer(PLACE_TOILETS_LAYER)) map.removeLayer(PLACE_TOILETS_LAYER);
    if (map.getSource(SRC)) map.removeSource(SRC);
  };
}
