import { describe, expect, it } from "vitest";
import type { NtaBoundary, PolygonRings } from "@/lib/api/nta";
import type { AggregateResult, NtaAggregate } from "@/lib/geo/types";
import { MAX_ELEVATION_METERS, buildColumnModel } from "./layers";

const square: PolygonRings = [
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ],
];

function boundary(code: string, name: string, parts = 1): NtaBoundary {
  return {
    ntaCode: code,
    ntaName: name,
    borough: "Brooklyn",
    bbox: [0, 0, 1, 1],
    center: [0.5, 0.5],
    polygons: Array.from({ length: parts }, () => square),
  };
}

function nta(code: string, overrides: Partial<NtaAggregate> = {}): NtaAggregate {
  return {
    ntaCode: code,
    count: 0,
    nightCount: 0,
    weekendNightCount: 0,
    hours: new Array<number>(24).fill(0),
    months: [],
    helicopterMonths: [],
    topTypes: [],
    topDescriptors: [],
    topFactors: [],
    injured: 0,
    killed: 0,
    cyclists: 0,
    pedestrians: 0,
    severity: 0,
    ...overrides,
  };
}

function aggregate(dataset: "noise" | "crashes", ntas: NtaAggregate[]): AggregateResult {
  return {
    dataset,
    windowId: "90d",
    windowStart: "2026-07-21T00:00:00",
    windowEnd: "2026-10-19T23:59:59",
    generatedAt: "2026-10-19T00:00:00.000Z",
    totalRows: ntas.reduce((sum, item) => sum + item.count, 0),
    unassignedCount: 0,
    malformedCount: 0,
    ntas,
    boroughs: [],
    intersections: [],
    sources: [],
  };
}

describe("buildColumnModel", () => {
  const boundaries = [
    boundary("BK1", "Alpha", 2),
    boundary("BK2", "Beta"),
  ];
  const noise = aggregate("noise", [
    nta("BK1", { count: 100, nightCount: 40 }),
    nta("BK2", { count: 25, nightCount: 25 }),
  ]);
  const crashes = aggregate("crashes", [
    nta("BK1", { count: 10, injured: 5, killed: 1, severity: 35 }),
    nta("BK2", { count: 2, injured: 0, killed: 0, severity: 2 }),
  ]);

  it("emits one datum per polygon part", () => {
    const model = buildColumnModel({ boundaries, noise, crashes, layer: "noise" });
    expect(model.data).toHaveLength(3);
  });

  it("scales the tallest column to the max elevation", () => {
    const model = buildColumnModel({ boundaries, noise, crashes, layer: "noise" });
    expect(model.maxHeightValue).toBe(100);
    const tallest = Math.max(...model.data.map((datum) => datum.height));
    expect(tallest).toBeCloseTo(MAX_ELEVATION_METERS, 5);
  });

  it("uses counts per layer", () => {
    const noiseModel = buildColumnModel({ boundaries, noise, crashes, layer: "noise" });
    expect(noiseModel.data.find((d) => d.ntaCode === "BK2")?.count).toBe(25);

    const crashModel = buildColumnModel({ boundaries, noise, crashes, layer: "crashes" });
    expect(crashModel.data.find((d) => d.ntaCode === "BK2")?.count).toBe(2);

    const combined = buildColumnModel({ boundaries, noise, crashes, layer: "combined" });
    expect(combined.data.find((d) => d.ntaCode === "BK1")?.count).toBe(110);
  });

  it("returns an empty model until data arrives", () => {
    const model = buildColumnModel({
      boundaries: null,
      noise: null,
      crashes: null,
      layer: "noise",
    });
    expect(model.data).toHaveLength(0);
    expect(model.maxHeightValue).toBe(0);
  });
});
