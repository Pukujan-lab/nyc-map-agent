import type { Layer } from "@deck.gl/core";
import { PolygonLayer } from "@deck.gl/layers";
import type {
  BlockDatum,
  LayerId,
  MapScale,
  NeighborhoodDatum,
} from "@/lib/layers";

export type HoverInfo =
  | { kind: "neighborhood"; x: number; y: number; datum: NeighborhoodDatum }
  | { kind: "block"; x: number; y: number; datum: BlockDatum };

export interface BuildLayersParams {
  neighborhoods: NeighborhoodDatum[];
  blocks: BlockDatum[];
  layer: LayerId;
  scale: MapScale;
  highlightedNtaCodes: string[];
  selectedNtaCode: string | null;
  selectedBlockKey: string | null;
  animate: boolean;
  onHover: (info: HoverInfo | null) => void;
  onSelectNta: (ntaCode: string) => void;
  onSelectBlock: (block: BlockDatum) => void;
}

const OUTLINE: [number, number, number, number] = [8, 12, 22, 165];
const BLOCK_OUTLINE: [number, number, number, number] = [8, 12, 22, 70];

/**
 * Flat, north-up map: one filled polygon per neighborhood, plus a grid of
 * ~300 m squares on top when the Blocks scale is on. No extrusion and no
 * height encoding — color alone carries the number, which is what makes the
 * four-color legend readable.
 */
export function buildMapLayers({
  neighborhoods,
  blocks,
  layer,
  scale,
  highlightedNtaCodes,
  selectedNtaCode,
  selectedBlockKey,
  animate,
  onHover,
  onSelectNta,
  onSelectBlock,
}: BuildLayersParams): Layer[] {
  const showBlocks = scale === "blocks";
  const transitions = animate ? { getFillColor: { duration: 260 } } : undefined;

  const neighborhoodLayer = new PolygonLayer<NeighborhoodDatum>({
    id: "neighborhood-fill",
    data: neighborhoods,
    extruded: false,
    filled: true,
    stroked: true,
    getPolygon: (datum) => datum.polygon,
    getFillColor: (datum) => datum.fill,
    getLineColor: OUTLINE,
    getLineWidth: showBlocks ? 0.7 : 1.2,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 1,
    opacity: showBlocks ? 0.5 : 1,
    pickable: !showBlocks,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 90],
    transitions,
    updateTriggers: {
      getFillColor: [layer, scale],
      getLineWidth: [scale],
    },
    onHover: (info) => {
      const datum = info.object ?? null;
      onHover(datum ? { kind: "neighborhood", x: info.x, y: info.y, datum } : null);
    },
    onClick: (info) => {
      if (!info.object) return false;
      onSelectNta(info.object.ntaCode);
      return true;
    },
  });

  const blockLayer = new PolygonLayer<BlockDatum>({
    id: "block-fill",
    data: showBlocks ? blocks : [],
    extruded: false,
    filled: true,
    stroked: true,
    getPolygon: (datum) => datum.polygon,
    getFillColor: (datum) => datum.fill,
    getLineColor: BLOCK_OUTLINE,
    getLineWidth: 0.4,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 0.5,
    pickable: showBlocks,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 130],
    transitions,
    updateTriggers: { getFillColor: [layer] },
    onHover: (info) => {
      const datum = info.object ?? null;
      onHover(datum ? { kind: "block", x: info.x, y: info.y, datum } : null);
    },
    onClick: (info) => {
      if (!info.object) return false;
      onSelectBlock(info.object);
      return true;
    },
  });

  const selectedBlock = showBlocks
    ? (blocks.find((block) => block.key === selectedBlockKey) ?? null)
    : null;

  const blockSelection = new PolygonLayer<BlockDatum>({
    id: "block-selection",
    data: selectedBlock ? [selectedBlock] : [],
    filled: false,
    stroked: true,
    getPolygon: (datum) => datum.polygon,
    getLineColor: [255, 255, 255, 255],
    getLineWidth: 3,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 2,
    pickable: false,
  });

  const highlightSet = new Set(highlightedNtaCodes);
  const outlineData = neighborhoods.filter(
    (datum) =>
      highlightSet.has(datum.ntaCode) || datum.ntaCode === selectedNtaCode,
  );

  const outlineLayer = new PolygonLayer<NeighborhoodDatum>({
    id: "neighborhood-outline",
    data: outlineData,
    extruded: false,
    filled: false,
    stroked: true,
    getPolygon: (datum) => datum.polygon,
    getLineColor: (datum) =>
      datum.ntaCode === selectedNtaCode
        ? [255, 255, 255, 240]
        : [56, 189, 248, 255],
    getLineWidth: (datum) => (datum.ntaCode === selectedNtaCode ? 3 : 2.5),
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 2,
    pickable: false,
    updateTriggers: {
      getLineColor: [selectedNtaCode, highlightedNtaCodes.join(",")],
    },
  });

  return [neighborhoodLayer, blockLayer, blockSelection, outlineLayer];
}
