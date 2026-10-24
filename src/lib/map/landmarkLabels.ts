import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { TIER_MIN_ZOOM, guideLandmarks, loadGuideLandmarks, type GuideCategory, type GuideLandmark } from "@/lib/guide/landmarkGuide";

/**
 * Landmarks on the simple map (#361 goal 3, after #363's four names): a badge
 * and a name for well-known places in all five boroughs, a few citywide and
 * more as you zoom in (tier 1 from z9, tier 2 from z12, tier 3 from z14).
 * Plain MapLibre symbols, no three.js.
 *
 * Every layer id here starts with LANDMARK_LAYER_PREFIX ("landmark-"). Rules
 * that clean or declutter the map must leave layers with that prefix alone:
 * landmarks are how people know where they are, so they stay in every view.
 */
export const LANDMARK_LAYER_PREFIX = "landmark-";
export const LANDMARK_LABELS_SOURCE = "landmark-guide";
export const LANDMARK_LABELS_LAYER = "landmark-labels";

export function isLandmarkLayer(id: string): boolean {
  return id.startsWith(LANDMARK_LAYER_PREFIX);
}

type Props = Pick<GuideLandmark, "id" | "name" | "category" | "tier"> & { sort: number };

export function landmarkLabelsGeoJson(list: readonly GuideLandmark[]): FeatureCollection<Point, Props> {
  return {
    type: "FeatureCollection",
    features: list.map((l) => ({
      type: "Feature",
      // Stronger landmarks are placed first when two collide.
      properties: { id: l.id, name: l.name, category: l.category, tier: l.tier, sort: l.tier * 1000 - l.sitelinks },
      geometry: { type: "Point", coordinates: [l.lon, l.lat] },
    })),
  };
}

/** Badge colour per kind; white glyph and ring read on light and dark maps. */
export const CATEGORY_COLOR: Record<GuideCategory, string> = {
  tower: "#334155",
  bridge: "#0f766e",
  station: "#1d4ed8",
  monument: "#7c3aed",
  venue: "#c2410c",
  museum: "#9d174d",
  store: "#b45309",
  square: "#4d7c0f",
  park: "#15803d",
  worship: "#6d28d9",
  civic: "#475569",
};

/** 24-unit glyph paths, drawn white on the badge. */
const GLYPH: Record<GuideCategory, string> = {
  tower: "M10 4h4v3h2v13H8V7h2z",
  bridge: "M3 15h18v2H3zM4 15c3-6 13-6 16 0h-2c-3-4-9-4-12 0z",
  station: "M7 4h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2l2 3h-2l-2-3h-6l-2 3H5l2-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 3v4h10V7zm1 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  monument: "M12 3l3 4v11h3v3H6v-3h3V7z",
  venue: "M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 16.2 7 19l1.2-5.6L4 9.6 9.6 9z",
  museum: "M12 3l9 5H3zM5 10h2v7H5zm4 0h2v7H9zm4 0h2v7h-2zm4 0h2v7h-2zM3 18h18v2H3z",
  store: "M6 8h12l1 12H5zM9 8a3 3 0 0 1 6 0h-1.5a1.5 1.5 0 0 0-3 0z",
  square: "M12 4l8 8-8 8-8-8z",
  park: "M12 3a6 6 0 0 1 2 11.7V20h-4v-5.3A6 6 0 0 1 12 3z",
  worship: "M12 3c4 2 6 5 6 9v8H6v-8c0-4 2-7 6-9zm-1 10v7h2v-7z",
  civic: "M6 3h2v18H6zM8 4h10l-2 4 2 4H8z",
};

const ICON = (c: GuideCategory) => `landmark-icon-${c}`;
const ICON_PX = 22;

/** Adds one badge image per kind, once per style. Needs a canvas, so browser only. */
function addIcons(map: MapLibreMap): void {
  const ratio = 2;
  for (const cat of Object.keys(GLYPH) as GuideCategory[]) {
    if (map.hasImage(ICON(cat))) continue;
    const size = ICON_PX * ratio;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - ratio, 0, Math.PI * 2);
    ctx.fillStyle = CATEGORY_COLOR[cat];
    ctx.fill();
    ctx.lineWidth = 1.5 * ratio;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    const s = (size * 0.62) / 24;
    ctx.setTransform(s, 0, 0, s, (size - 24 * s) / 2, (size - 24 * s) / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill(new Path2D(GLYPH[cat]));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    map.addImage(ICON(cat), ctx.getImageData(0, 0, size, size), { pixelRatio: ratio });
  }
}

/**
 * Per-feature zoom gate as a layout value: below a feature's tier zoom the
 * value is `off`, so that symbol is not placed at all (no hidden collision box).
 */
export function byTierZoom<T extends string | number>(on: ExpressionSpecification | T, off: T): ExpressionSpecification {
  const z2 = TIER_MIN_ZOOM[2];
  const z3 = TIER_MIN_ZOOM[3];
  return [
    "step", ["zoom"],
    ["case", ["==", ["get", "tier"], 1], on, off],
    z2, ["case", ["<=", ["get", "tier"], 2], on, off],
    z3, on,
  ] as ExpressionSpecification;
}

/** Adds the source and layer once per style; safe to call again (it also re-raises the layer above later symbols). */
export function installLandmarkLabels(map: MapLibreMap, color: string, halo: string): void {
  if (!map.getSource(LANDMARK_LABELS_SOURCE)) {
    const list = guideLandmarks();
    map.addSource(LANDMARK_LABELS_SOURCE, { type: "geojson", data: landmarkLabelsGeoJson(list), attribution: "Landmarks: Wikidata (CC0)" });
    // The list is a lazy chunk: fill the source when it arrives (if this style still has it).
    if (!list.length) {
      void loadGuideLandmarks()
        .then((all) => {
          const src = map.getSource(LANDMARK_LABELS_SOURCE);
          if (src && "setData" in src) (src as GeoJSONSource).setData(landmarkLabelsGeoJson(all));
        })
        .catch(() => {});
    }
  }
  addIcons(map);
  if (!map.getLayer(LANDMARK_LABELS_LAYER)) {
    map.addLayer({
      id: LANDMARK_LABELS_LAYER,
      type: "symbol",
      source: LANDMARK_LABELS_SOURCE,
      minzoom: TIER_MIN_ZOOM[1],
      layout: {
        "icon-image": byTierZoom(["concat", "landmark-icon-", ["get", "category"]], ""),
        "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 14, 1, 17, 1.15],
        // Badges always draw; names take the room that is left.
        "icon-allow-overlap": true,
        "text-field": byTierZoom(["get", "name"], ""),
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, ["case", ["==", ["get", "tier"], 1], 11, 10], 16, 13],
        "text-anchor": "top",
        "text-offset": [0, 0.9],
        "text-max-width": 9,
        "text-optional": true,
        "text-pitch-alignment": "viewport",
        "icon-pitch-alignment": "viewport",
        "symbol-sort-key": ["get", "sort"],
      },
      paint: { "text-color": color, "text-halo-color": halo, "text-halo-width": 1.4 },
    });
  } else {
    map.setPaintProperty(LANDMARK_LABELS_LAYER, "text-color", color);
    map.setPaintProperty(LANDMARK_LABELS_LAYER, "text-halo-color", halo);
  }
  // Symbols on top are placed first, so landmarks win collisions with basemap names.
  // Only when something landed above it: each move fires a styledata event.
  const layers = map.getStyle()?.layers ?? [];
  if (layers[layers.length - 1]?.id !== LANDMARK_LABELS_LAYER) map.moveLayer(LANDMARK_LABELS_LAYER);
}
