import { BLOCK_GRID_DEG, blockPolygon } from "@/lib/geo/blocks";
import {
  heightFor,
  type BlockDatum,
  type MapModel,
  type NeighborhoodDatum,
  type SourceBreakdown,
} from "@/lib/layers";
import { averageComposite } from "./composite";
import type { SourceCounts } from "./fetchSource";
import { SOURCE_BY_ID } from "./registry";

export type ViewMode =
  | { kind: "legacy" }
  | { kind: "source"; sourceId: string }
  | { kind: "average"; sourceIds: string[] };

/** URL form: `legacy`, `src:<id>`, or `avg`. */
export function parseViewMode(view: string | null, avgIds: string[]): ViewMode {
  if (view === "avg") return { kind: "average", sourceIds: avgIds };
  if (view?.startsWith("src:")) {
    const id = view.slice(4);
    if (id in SOURCE_BY_ID) return { kind: "source", sourceId: id };
  }
  return { kind: "legacy" };
}

export function viewModeToParam(mode: ViewMode): string {
  if (mode.kind === "average") return "avg";
  if (mode.kind === "source") return `src:${mode.sourceId}`;
  return "legacy";
}

function emptyBlock(key: string, lat: number, lon: number, ntaCode: string): BlockDatum {
  return {
    key,
    ntaCode,
    polygon: blockPolygon(lon, lat),
    center: { lon: lon + BLOCK_GRID_DEG / 2, lat: lat + BLOCK_GRID_DEG / 2 },
    value: 0,
    height: 0,
    nightCount: 0,
    noiseCount: 0,
    crashCount: 0,
    injured: 0,
    killed: 0,
    cyclists: 0,
    addresses: [],
    streets: [],
  };
}

/**
 * Re-scores a map model (built with the `combined` layer, so every populated
 * block exists) for a single registry source or for the Average composite.
 * Only `value`, `height` and `breakdown` change; everything else — names,
 * noise/crash detail, addresses — is carried through untouched.
 */
export function applyView(
  base: MapModel,
  mode: ViewMode,
  counts: Record<string, SourceCounts | undefined>,
): MapModel {
  if (mode.kind === "legacy") return base;
  const ids = (mode.kind === "source" ? [mode.sourceId] : mode.sourceIds).filter(
    (id) => counts[id],
  );
  const loaded = ids.map((id) => counts[id] as SourceCounts);

  // Every block any contributing source touches, plus the base grid.
  const blockByKey = new Map<string, BlockDatum>();
  for (const block of base.blocks) blockByKey.set(block.key, block);
  for (const source of loaded) {
    for (const [key, cell] of Object.entries(source.blocks)) {
      if (!blockByKey.has(key)) {
        blockByKey.set(key, emptyBlock(key, cell.lat, cell.lon, cell.ntaCode));
      }
    }
  }
  const blockKeys = Array.from(blockByKey.keys());
  const ntaKeys = base.neighborhoods.map((datum) => datum.ntaCode);

  const ntaValues: Record<string, Record<string, number>> = {};
  const blockValues: Record<string, Record<string, number>> = {};
  for (const source of loaded) {
    ntaValues[source.sourceId] = source.byNta;
    const perBlock: Record<string, number> = {};
    for (const [key, cell] of Object.entries(source.blocks)) perBlock[key] = cell.count;
    blockValues[source.sourceId] = perBlock;
  }

  const score = (
    values: Record<string, Record<string, number>>,
    keys: string[],
  ): Record<string, { value: number; breakdown: SourceBreakdown[] }> => {
    const out: Record<string, { value: number; breakdown: SourceBreakdown[] }> = {};
    if (mode.kind === "source") {
      const only = ids[0];
      for (const key of keys) {
        const value = only ? (values[only]?.[key] ?? 0) : 0;
        out[key] = { value, breakdown: only ? [{ sourceId: only, value }] : [] };
      }
      return out;
    }
    const composite = averageComposite(values, ids, keys);
    for (const key of keys) {
      const entry = composite[key];
      out[key] = { value: entry.score, breakdown: entry.parts };
    }
    return out;
  };

  const ntaScores = score(ntaValues, ntaKeys);
  const blockScores = score(blockValues, blockKeys);

  const ntaMax = Math.max(0, ...Object.values(ntaScores).map((s) => s.value));
  const neighborhoods: NeighborhoodDatum[] = base.neighborhoods.map((datum) => {
    const s = ntaScores[datum.ntaCode];
    return { ...datum, value: s.value, height: heightFor(s.value, ntaMax), breakdown: s.breakdown };
  });

  const blockMax = Math.max(0, ...Object.values(blockScores).map((s) => s.value));
  const blocks: BlockDatum[] = [];
  for (const [key, block] of blockByKey) {
    const s = blockScores[key];
    if (!(s.value > 0)) continue;
    blocks.push({ ...block, value: s.value, height: heightFor(s.value, blockMax), breakdown: s.breakdown });
  }

  const shown = base.scale === "blocks" ? blocks : neighborhoods;
  const single = mode.kind === "source" ? SOURCE_BY_ID[mode.sourceId] : undefined;
  return {
    ...base,
    neighborhoods,
    blocks,
    maxValue: base.scale === "blocks" ? blockMax : ntaMax,
    areasWithData: shown.filter((d) => d.value > 0).length,
    view: {
      kind: mode.kind,
      label: single ? single.label : "Average of selected sources",
      unit: single ? single.unit : "avg. percentile",
      contributors: ids,
    },
  };
}
