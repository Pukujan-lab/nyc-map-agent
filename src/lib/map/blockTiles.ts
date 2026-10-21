import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { DATA_BACKEND } from "@/lib/datasets/backend";
import type { BlockDatum } from "@/lib/layers";
import { ensurePmtilesProtocol } from "./pmtilesProtocol";
import { DATA_LAYERS, LAYER_IDS, SOURCE_IDS } from "./style";

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
  return true;
}

/** Pushes block heights: feature-state on the tiles, or the GeoJSON squares. */
export function pushBlocks(map: MapLibreMap, blocks: BlockDatum[], geojson: FeatureCollection): void {
  const source = map.getSource(SOURCE_IDS.blocks);
  if (!source) return;
  if (source.type !== "vector") {
    (source as GeoJSONSource).setData(geojson);
    return;
  }
  map.removeFeatureState({ source: SOURCE_IDS.blocks, sourceLayer: SOURCE_LAYER });
  for (const block of blocks) {
    const id = Number(block.key);
    if (Number.isInteger(id)) {
      map.setFeatureState({ source: SOURCE_IDS.blocks, sourceLayer: SOURCE_LAYER, id }, { height: block.height });
    }
  }
}
