import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { DATA_BACKEND } from "@/lib/datasets/backend";
import type { BlockDatum } from "@/lib/layers";
import { ensurePmtilesProtocol } from "./pmtilesProtocol";
import { CHOROPLETH_RAMP, DATA_LAYERS, LAYER_IDS, SOURCE_IDS } from "./style";

/**
 * Real NYC tax blocks (Octo backend): MapPLUTO lots dissolved by borough +
 * block, simplified and tiled into nyc-blocks.pmtiles (scripts/build-block-tiles.ts),
 * published through Octo files to R2 and served same-origin by /api/block-tiles.
 * The blocks source swaps from GeoJSON squares to this vector source; the
 * columns keep their layer ids and paint, and heights arrive as feature-state
 * keyed by the tile feature id (boro * 100000 + block). The Socrata fallback
 * keeps the ~300 m grid, because the browser has no block join.
 */
export const USE_BLOCK_TILES = DATA_BACKEND === "octo";
const BLOCK_TILES: string = import.meta.env.VITE_BLOCK_TILES_URL ?? "/api/block-tiles";
const SOURCE_LAYER = "blocks";
export const BLOCK_FILL_LAYER = "block-tile-fill";
const BLOCK_FILL = BLOCK_FILL_LAYER;
const SWAPPED: string[] = [LAYER_IDS.blocks, LAYER_IDS.blockOutline];

/** Swaps the blocks source to the PMTiles; true when it did (data must be re-pushed). */
export async function installBlockTiles(map: MapLibreMap): Promise<boolean> {
  if (!USE_BLOCK_TILES || map.getSource(SOURCE_IDS.blocks)?.type === "vector") return false;
  await ensurePmtilesProtocol();
  if (map.getSource(SOURCE_IDS.blocks)?.type === "vector") return false;
  const order = (map.getStyle().layers ?? []).map((l) => l.id);
  const specs = SWAPPED.map((id) => {
    const spec = DATA_LAYERS.find((l) => l.id === id) as LayerSpecification;
    const current = map.getLayer(id);
    const after = order.slice(order.indexOf(id) + 1).find((l) => !SWAPPED.includes(l));
    return {
      spec: { ...spec, "source-layer": SOURCE_LAYER, layout: { ...spec.layout, visibility: current?.visibility ?? "none" } },
      before: after,
    };
  });
  for (const id of SWAPPED) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SOURCE_IDS.blocks)) map.removeSource(SOURCE_IDS.blocks);
  const url = /^https?:\/\//.test(BLOCK_TILES) ? BLOCK_TILES : `${window.location.origin}${BLOCK_TILES}`;
  map.addSource(SOURCE_IDS.blocks, { type: "vector", url: `pmtiles://${url}` });
  for (const { spec, before } of specs) map.addLayer(spec as LayerSpecification, before);
  // The filled-areas view of real blocks: same ramp as area-fill, keyed by feature-state t.
  map.addLayer(
    {
      id: BLOCK_FILL,
      type: "fill",
      source: SOURCE_IDS.blocks,
      "source-layer": SOURCE_LAYER,
      layout: { visibility: "none" },
      paint: {
        "fill-color": ["interpolate", ["linear"], ["coalesce", ["feature-state", "t"], 0], ...CHOROPLETH_RAMP.flat()] as never,
        // Same zoom fade as area-fill (#46); empty blocks barely tinted.
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          14, ["case", [">", ["coalesce", ["feature-state", "t"], 0], 0], 0.62, 0.06],
          16, ["case", [">", ["coalesce", ["feature-state", "t"], 0], 0], 0.42, 0.04],
          18, ["case", [">", ["coalesce", ["feature-state", "t"], 0], 0], 0.22, 0.02],
        ] as never,
        "fill-outline-color": "rgba(51, 65, 85, 0.35)",
      },
    },
    map.getLayer(LAYER_IDS.areaFill) ? LAYER_IDS.areaFill : undefined,
  );
  return true;
}

/** Pushes block heights: feature-state on the tiles, or the GeoJSON squares. */
export function pushBlocks(map: MapLibreMap, blocks: BlockDatum[], geojson: FeatureCollection): void {
  const source = map.getSource(SOURCE_IDS.blocks);
  if (!source) return;
  if (source.type !== "vector") {
    void (source as GeoJSONSource).setData(geojson);
    return;
  }
  map.removeFeatureState({ source: SOURCE_IDS.blocks, sourceLayer: SOURCE_LAYER });
  const max = blocks.reduce((m, b) => Math.max(m, b.shade ?? b.value), 0);
  for (const block of blocks) {
    const id = Number(block.key);
    if (Number.isInteger(id)) {
      const t = max > 0 ? Math.sqrt(Math.max(block.shade ?? block.value, 0) / max) : 0;
      map.setFeatureState({ source: SOURCE_IDS.blocks, sourceLayer: SOURCE_LAYER, id }, { height: block.height, t });
    }
  }
}

/** Shows the tile-backed block fill (filled-areas view at the Blocks scale). */
export function setBlockFillVisible(map: MapLibreMap, visible: boolean): void {
  if (map.getLayer(BLOCK_FILL)) map.setLayoutProperty(BLOCK_FILL, "visibility", visible ? "visible" : "none");
}
