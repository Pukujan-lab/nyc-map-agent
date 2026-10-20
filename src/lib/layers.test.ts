import { describe, expect, it } from "vitest";
import type { NtaBoundary, PolygonRings } from "@/lib/api/nta";
import type { AggregateResult, BlockCell, NtaAggregate } from "@/lib/geo/types";
import {
  bucketFor,
  buildMapModel,
  formatBucketRange,
  thresholdsFor,
} from "./layers";

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

function block(key: string, overrides: Partial<BlockCell> = {}): BlockCell {
  return {
    key,
    lon: 0,
    lat: 0,
    ntaCode: "BK1",
    count: 1,
    nightCount: 0,
    injured: 0,
    killed: 0,
    cyclists: 0,
    ...overrides,
  };
}

function aggregate(
  dataset: "noise" | "crashes",
  ntas: NtaAggregate[],
  blocks: BlockCell[] = [],
): AggregateResult {
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
    blocks,
    boroughs: [],
    intersections: [],
    sources: [],
  };
}

describe("thresholdsFor", () => {
  it("splits the positive values into quartiles", () => {
    const thresholds = thresholdsFor([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(thresholds).toEqual([3, 5, 7]);
  });

  it("ignores zeros so empty areas do not skew the cuts", () => {
    const withZeros = thresholdsFor([0, 0, 0, 0, 4, 8, 12, 16]);
    const withoutZeros = thresholdsFor([4, 8, 12, 16]);
    expect(withZeros).toEqual(withoutZeros);
  });

  it("keeps the buckets disjoint when every area ties", () => {
    const thresholds = thresholdsFor([5, 5, 5, 5]);
    expect(thresholds[1]).toBeGreaterThan(thresholds[0]);
    expect(thresholds[2]).toBeGreaterThan(thresholds[1]);
    expect(bucketFor(5, thresholds)).toBe(0);
    expect(bucketFor(9, thresholds)).toBe(3);
  });

  it("returns zero cuts when there is nothing to color", () => {
    expect(thresholdsFor([])).toEqual([0, 0, 0]);
    expect(thresholdsFor([0, 0])).toEqual([0, 0, 0]);
  });
});

describe("buildMapModel", () => {
  const boundaries = [
    boundary("BK1", "Alpha", 2),
    boundary("BK2", "Beta"),
    boundary("BK3", "Gamma"),
  ];
  const noise = aggregate(
    "noise",
    [
      nta("BK1", { count: 100, nightCount: 40 }),
      nta("BK2", { count: 25, nightCount: 25 }),
    ],
    [block("1:1", { count: 60 }), block("2:2", { count: 10 })],
  );
  const crashes = aggregate(
    "crashes",
    [
      nta("BK1", { count: 10, injured: 5, killed: 1, severity: 35 }),
      nta("BK2", { count: 2, injured: 0, killed: 0, severity: 2 }),
    ],
    [
      block("1:1", { count: 4, injured: 2 }),
      block("3:3", { count: 1 }),
    ],
  );

  it("emits one neighborhood datum per polygon part", () => {
    const model = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "noise",
      scale: "neighborhoods",
    });
    expect(model.neighborhoods).toHaveLength(4);
  });

  it("uses the count for the active layer", () => {
    const asNoise = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "noise",
      scale: "neighborhoods",
    });
    expect(
      asNoise.neighborhoods.find((datum) => datum.ntaCode === "BK2")?.value,
    ).toBe(25);

    const asCrashes = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "crashes",
      scale: "neighborhoods",
    });
    expect(
      asCrashes.neighborhoods.find((datum) => datum.ntaCode === "BK2")?.value,
    ).toBe(2);

    const combined = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "combined",
      scale: "neighborhoods",
    });
    expect(
      combined.neighborhoods.find((datum) => datum.ntaCode === "BK1")?.value,
    ).toBe(110);
  });

  it("stacks noise and crash blocks that share a grid key", () => {
    const model = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "combined",
      scale: "blocks",
    });
    const shared = model.blocks.find((datum) => datum.key === "1:1");
    expect(shared?.value).toBe(64);
    expect(shared?.noiseCount).toBe(60);
    expect(shared?.crashCount).toBe(4);
    expect(shared?.injured).toBe(2);
    expect(model.blocks).toHaveLength(3);
  });

  it("colors every area with data and leaves empty ones grey", () => {
    const model = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "noise",
      scale: "neighborhoods",
    });
    const filled = model.neighborhoods.filter((datum) => datum.value > 0);
    const empty = model.neighborhoods.filter((datum) => datum.value === 0);
    expect(filled).toHaveLength(3);
    expect(empty).toHaveLength(1);
    expect(filled.every((datum) => datum.fill[3] > 100)).toBe(true);
    expect(empty.every((datum) => datum.fill[3] < 60)).toBe(true);
    expect(model.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(
      filled.length,
    );
  });

  it("describes each bucket as a value range", () => {
    const model = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "noise",
      scale: "neighborhoods",
    });
    expect(model.buckets[0].min).toBe(1);
    expect(model.buckets[3].max).toBeNull();
    expect(formatBucketRange(model.buckets[0]).startsWith("≤")).toBe(true);
    expect(formatBucketRange(model.buckets[3]).endsWith("+")).toBe(true);
    expect(formatBucketRange(model.buckets[1])).toContain("–");
  });

  it("returns an empty model until data arrives", () => {
    const model = buildMapModel({
      boundaries: null,
      noise: null,
      crashes: null,
      layer: "noise",
      scale: "neighborhoods",
    });
    expect(model.neighborhoods).toHaveLength(0);
    expect(model.blocks).toHaveLength(0);
    expect(model.buckets).toHaveLength(0);
    expect(model.maxValue).toBe(0);
  });
});
