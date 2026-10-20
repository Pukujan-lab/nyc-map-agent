import type { Layer } from "@deck.gl/core";
import { PolygonLayer } from "@deck.gl/layers";
import type { ColumnDatum, LayerId } from "@/lib/layers";

export interface HoverInfo {
  x: number;
  y: number;
  object: ColumnDatum;
}

export interface BuildLayersParams {
  data: ColumnDatum[];
  layer: LayerId;
  highlightedNtaCodes: string[];
  selectedNtaCode: string | null;
  animate: boolean;
  onHover: (info: HoverInfo | null) => void;
  onSelect: (ntaCode: string) => void;
}

const HIGHLIGHT_OFFSET = 90;

/**
 * Extruded neighborhood columns. Height comes from the incident count, color
 * from the layer's severity metric; both are precomputed in `buildColumnModel`
 * so the legend and the map can never disagree.
 */
export function buildNtaLayers({
  data,
  layer,
  highlightedNtaCodes,
  selectedNtaCode,
  animate,
  onHover,
  onSelect,
}: BuildLayersParams): Layer[] {
  const transitions = animate
    ? { getElevation: { duration: 400 }, getFillColor: { duration: 400 } }
    : undefined;

  const columns = new PolygonLayer<ColumnDatum>({
    id: "nta-columns",
    data,
    extruded: true,
    filled: true,
    stroked: true,
    getPolygon: (datum) => datum.polygon,
    getElevation: (datum) => datum.height,
    getFillColor: (datum) => datum.color,
    getLineColor: [10, 16, 28, 170],
    getLineWidth: 1,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 1,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 70],
    material: {
      ambient: 0.55,
      diffuse: 0.65,
      shininess: 40,
      specularColor: [70, 80, 100],
    },
    transitions,
    updateTriggers: {
      getElevation: [layer],
      getFillColor: [layer],
    },
    onHover: (info) => {
      const object = info.object ?? null;
      onHover(object ? { x: info.x, y: info.y, object } : null);
    },
    onClick: (info) => {
      if (info.object) {
        onSelect(info.object.ntaCode);
        return true;
      }
      return false;
    },
  });

  const highlightSet = new Set(highlightedNtaCodes);
  const highlightData = data.filter(
    (datum) =>
      highlightSet.has(datum.ntaCode) || datum.ntaCode === selectedNtaCode,
  );

  const highlight = new PolygonLayer<ColumnDatum>({
    id: "nta-highlight",
    data: highlightData,
    extruded: true,
    filled: true,
    stroked: true,
    getPolygon: (datum) => datum.polygon,
    getElevation: (datum) => datum.height + HIGHLIGHT_OFFSET,
    getFillColor: (datum) =>
      datum.ntaCode === selectedNtaCode
        ? [255, 255, 255, 40]
        : [56, 189, 248, 48],
    getLineColor: (datum) =>
      datum.ntaCode === selectedNtaCode
        ? [255, 255, 255, 240]
        : [56, 189, 248, 255],
    getLineWidth: 2.5,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 2,
    pickable: false,
    transitions: animate
      ? { getElevation: { duration: 400 }, getFillColor: { duration: 400 } }
      : undefined,
    updateTriggers: {
      getElevation: [selectedNtaCode, highlightedNtaCodes.join(",")],
      getFillColor: [selectedNtaCode],
    },
  });

  return [columns, highlight];
}
