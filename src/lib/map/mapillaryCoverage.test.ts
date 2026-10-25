import { describe, expect, it } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import { COVERAGE_LAYER, COVERAGE_SOURCE, coverageTiles, showCoverage } from "./mapillaryCoverage";

function fakeMap() {
  const sources = new Map<string, unknown>();
  const layers: { id: string; before?: string }[] = [];
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, s: unknown) => void sources.set(id, s),
    removeSource: (id: string) => void sources.delete(id),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: (l: { id: string }, before?: string) => void layers.push({ id: l.id, before }),
    removeLayer: (id: string) => void layers.splice(layers.findIndex((l) => l.id === id), 1),
    getStyle: () => ({ layers: [{ id: "roads", type: "line" }, { id: "labels", type: "symbol" }] }),
  };
  return { map: map as unknown as MaplibreMap, sources, layers };
}

describe("Mapillary coverage lines (#10)", () => {
  it("puts the token in the tile URL, escaped", () => {
    expect(coverageTiles("MLY|1&2")).toContain("access_token=MLY%7C1%262");
  });

  it("draws under the labels and cleans up after itself", () => {
    const { map, sources, layers } = fakeMap();
    const off = showCoverage(map, "t");
    expect(sources.has(COVERAGE_SOURCE)).toBe(true);
    expect(layers).toEqual([{ id: COVERAGE_LAYER, before: "labels" }]);
    showCoverage(map, "t");
    expect(layers).toHaveLength(1);
    off();
    expect(sources.size).toBe(0);
    expect(layers).toHaveLength(0);
  });
});
