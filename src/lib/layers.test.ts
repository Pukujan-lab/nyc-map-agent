import { describe, expect, it } from "vitest";
import type { NtaBoundary, PolygonRings } from "@/lib/api/nta";
import type { AggregateResult, BlockCell, NtaAggregate } from "@/lib/geo/types";
import { buildMapModel, heightFor } from "./layers";

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
    topAddresses: [],
    topStreets: [],
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

describe("heightFor", () => {
  it("draws nothing for an area with no records", () => {
    expect(heightFor(0, 100)).toBe(0);
    expect(heightFor(-3, 100)).toBe(0);
  });

  it("rises with the count and peaks at the tallest column", () => {
    expect(heightFor(10, 100)).toBeLessThan(heightFor(50, 100));
    expect(heightFor(50, 100)).toBeLessThan(heightFor(100, 100));
    expect(heightFor(100, 100)).toBe(1800);
  });

  it("never exceeds the ceiling when a value overshoots the peak", () => {
    expect(heightFor(400, 100)).toBe(1800);
  });

  it("survives a peak of zero", () => {
    expect(heightFor(0, 0)).toBe(0);
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
      nta("BK1", {
        count: 100,
        nightCount: 40,
        topAddresses: [["123 BROADWAY", 9]],
      }),
      nta("BK2", { count: 25, nightCount: 25 }),
    ],
    [
      block("1:1", {
        count: 60,
        addresses: [
          ["123 BROADWAY", 5],
          ["125 BROADWAY", 3],
        ],
      }),
      block("2:2", { count: 10, addresses: [["9 WATER ST", 4]] }),
    ],
  );
  const crashes = aggregate(
    "crashes",
    [
      nta("BK1", { count: 10, injured: 5, killed: 1, severity: 35 }),
      nta("BK2", { count: 2, injured: 0, killed: 0, severity: 2 }),
    ],
    [
      block("1:1", { count: 4, injured: 2, streets: [["BROADWAY", 4]] }),
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

  it("carries house numbers per block, and street names separately", () => {
    const model = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "combined",
      scale: "blocks",
    });
    const shared = model.blocks.find((datum) => datum.key === "1:1");
    expect(shared?.addresses).toEqual([
      ["123 BROADWAY", 5],
      ["125 BROADWAY", 3],
    ]);
    expect(shared?.streets).toEqual([["BROADWAY", 4]]);
  });

  it("caps the address list so a square cannot bloat the cache", () => {
    const many = aggregate(
      "noise",
      [nta("BK1", { count: 10 })],
      [
        block("1:1", {
          count: 10,
          addresses: [
            ["1 A ST", 5],
            ["2 A ST", 4],
            ["3 A ST", 3],
            ["4 A ST", 2],
            ["5 A ST", 1],
          ],
        }),
      ],
    );
    const model = buildMapModel({
      boundaries,
      noise: many,
      crashes: null,
      layer: "noise",
      scale: "blocks",
    });
    expect(model.blocks[0].addresses).toHaveLength(3);
    expect(model.blocks[0].addresses[0]).toEqual(["1 A ST", 5]);
  });

  it("hands neighborhood addresses through to the datum", () => {
    const model = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "noise",
      scale: "neighborhoods",
    });
    const alpha = model.neighborhoods.find((datum) => datum.ntaCode === "BK1");
    expect(alpha?.addresses).toEqual([["123 BROADWAY", 9]]);
  });

  it("counts the areas with data and the peak for the current scale", () => {
    const asNeighborhoods = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "noise",
      scale: "neighborhoods",
    });
    expect(asNeighborhoods.areasWithData).toBe(2);
    expect(asNeighborhoods.maxValue).toBe(100);

    const asBlocks = buildMapModel({
      boundaries,
      noise,
      crashes,
      layer: "noise",
      scale: "blocks",
    });
    expect(asBlocks.areasWithData).toBe(2);
    expect(asBlocks.maxValue).toBe(60);
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
    expect(model.areasWithData).toBe(0);
    expect(model.maxValue).toBe(0);
  });
});
