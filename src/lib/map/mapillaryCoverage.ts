import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Where street photos exist (#10): Mapillary's public coverage tiles, drawn
 * as thin green lines while the photo sheet is open, so the streets you can
 * walk through photos are visible before you step.
 */
export const COVERAGE_SOURCE = "mapillary-coverage";
export const COVERAGE_LAYER = "mapillary-sequences";

export function coverageTiles(token: string): string {
  return `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}`;
}

/** Adds the coverage lines under labels; returns a function that removes them. */
export function showCoverage(map: MaplibreMap, token: string): () => void {
  if (!map.getSource(COVERAGE_SOURCE)) {
    map.addSource(COVERAGE_SOURCE, { type: "vector", tiles: [coverageTiles(token)], minzoom: 6, maxzoom: 14, attribution: "© Mapillary" });
  }
  if (!map.getLayer(COVERAGE_LAYER)) {
    const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: COVERAGE_LAYER,
        type: "line",
        source: COVERAGE_SOURCE,
        "source-layer": "sequence",
        minzoom: 13,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#05cb63", "line-opacity": 0.7, "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 18, 3] },
      },
      firstSymbol,
    );
  }
  return () => {
    if (map.getLayer(COVERAGE_LAYER)) map.removeLayer(COVERAGE_LAYER);
    if (map.getSource(COVERAGE_SOURCE)) map.removeSource(COVERAGE_SOURCE);
  };
}
