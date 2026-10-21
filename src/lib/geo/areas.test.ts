import { describe, expect, it } from "vitest";
import type { NtaBoundary } from "@/lib/api/nta";
import { parseDistrictBoundaries } from "@/lib/api/districts";
import type { MapModel } from "@/lib/layers";
import { areasToGeoJson, boroughBoundaries, buildAreas } from "./areas";

const square = (x: number, y: number): NtaBoundary["polygons"] => [
  [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]],
];
const nta = (code: string, borough: string, x: number): NtaBoundary => ({
  ntaCode: code, ntaName: code, borough, bbox: [x, 0, x + 1, 1], center: [x + 0.5, 0.5], polygons: square(x, 0),
});
const boundaries = [nta("BK01", "Brooklyn", 0), nta("BK02", "Brooklyn", 1), nta("MN01", "Manhattan", 2)];

function model(values: Record<string, number>, kind?: "average"): MapModel {
  return {
    layer: "noise",
    scale: "neighborhoods",
    maxValue: 0,
    areasWithData: 0,
    blocks: [],
    view: kind ? { kind, label: "", unit: "", contributors: [] } : undefined,
    neighborhoods: boundaries.map((b) => ({
      id: `${b.ntaCode}:0`, ntaCode: b.ntaCode, ntaName: b.ntaName, borough: b.borough, polygon: b.polygons[0],
      value: values[b.ntaCode] ?? 0, height: 0, nightShare: 0, noiseCount: 0, crashCount: 0, injured: 0, killed: 0,
      cyclists: 0, addresses: [], streets: [],
    })),
  } as MapModel;
}

describe("buildAreas", () => {
  it("sums counts per borough and averages scores", () => {
    const sum = buildAreas({ scale: "boroughs", model: model({ BK01: 3, BK02: 5, MN01: 1 }), boundaries, districts: null });
    expect(Object.fromEntries(sum.map((a) => [a.code, a.value]))).toEqual({ Brooklyn: 8, Manhattan: 1 });
    const avg = buildAreas({ scale: "boroughs", model: model({ BK01: 40, BK02: 60 }, "average"), boundaries, districts: null });
    expect(avg.find((a) => a.code === "Brooklyn")?.value).toBe(50);
  });

  it("merges borough polygons and scales t against the peak", () => {
    expect(boroughBoundaries(boundaries).find((b) => b.ntaCode === "Brooklyn")?.polygons).toHaveLength(2);
    const fc = areasToGeoJson([
      { code: "a", name: "a", borough: "", value: 100, polygons: square(0, 0) },
      { code: "b", name: "b", borough: "", value: 25, polygons: square(1, 0) },
      { code: "c", name: "c", borough: "", value: 0, polygons: square(2, 0) },
    ]);
    expect(fc.features.map((f) => f.properties.t)).toEqual([1, 0.5]);
  });
});

describe("parseDistrictBoundaries", () => {
  it("names districts and drops joint interest areas", () => {
    const ring = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];
    const parsed = parseDistrictBoundaries({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { boro_cd: "303" }, geometry: { type: "Polygon", coordinates: ring } },
        { type: "Feature", properties: { boro_cd: "164" }, geometry: { type: "Polygon", coordinates: ring } },
      ],
    });
    expect(parsed.map((d) => [d.ntaCode, d.ntaName, d.borough])).toEqual([["303", "Brooklyn CD 3", "Brooklyn"]]);
  });
});
