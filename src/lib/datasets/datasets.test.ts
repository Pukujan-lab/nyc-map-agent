import { describe, expect, it } from "vitest";
import type { MapModel } from "@/lib/layers";
import { averageComposite, percentileRanks } from "./composite";
import { gridQuery, representativePoint, type SourceCounts } from "./fetchSource";
import { parseSourceList, SOURCE_BY_ID, SOURCES } from "./registry";
import { applyView, parseViewMode, viewModeToParam } from "./view";
import { routeUrl } from "@/lib/api/routing";
import type { GridSource } from "./registry";
import { windowBounds } from "@/lib/windows";

describe("registry", () => {
  it("has unique ids and valid 4x4 dataset ids", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SOURCES) expect(s.datasetId).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
  });

  it("drops unknown ids from URL lists", () => {
    expect(parseSourceList("noise,bogus,hpd,noise", [])).toEqual(["noise", "hpd"]);
    expect(parseSourceList(null, ["noise"])).toEqual(["noise"]);
  });
});

describe("gridQuery", () => {
  it("groups server-side on the block grid and filters the window", () => {
    const q = gridQuery(SOURCE_BY_ID.hpd as GridSource, windowBounds("90d", new Date(2026, 9, 20)));
    expect(q.$select).toContain("floor(latitude::number / 0.003) AS r");
    expect(q.$group).toBe("r, c");
    expect(q.$where).toContain("inspectiondate > '2026-07-22T00:00:00'");
  });

  it("sums a measure column when asked", () => {
    const q = gridQuery(SOURCE_BY_ID["pluto-units"] as GridSource, null);
    expect(q.$select).toContain("sum(unitsres::number) AS n");
    expect(q.$where).not.toContain(">");
  });
});

describe("representativePoint", () => {
  it("handles points, multipoints and multilines", () => {
    expect(representativePoint({ type: "Point", coordinates: [-73.9, 40.7] })).toEqual([-73.9, 40.7]);
    expect(
      representativePoint({ type: "MultiPoint", coordinates: [[-73.9, 40.7]] }),
    ).toEqual([-73.9, 40.7]);
    expect(
      representativePoint({
        type: "MultiLineString",
        coordinates: [[[-73.9, 40.7], [-73.8, 40.8], [-73.7, 40.9]]],
      }),
    ).toEqual([-73.8, 40.8]);
    expect(representativePoint(null)).toBeNull();
  });
});

describe("percentileRanks / averageComposite", () => {
  it("ranks 0–100 with tied zeros at the bottom", () => {
    const ranks = percentileRanks({ a: 10, b: 20, c: 30 }, ["a", "b", "c", "d"]);
    expect(ranks.d).toBe(0);
    expect(ranks.c).toBe(100);
    expect(ranks.a).toBeLessThan(ranks.b);
  });

  it("averages the percentiles of the selected sources only", () => {
    const keys = ["x", "y"];
    const out = averageComposite(
      { s1: { x: 5, y: 1 }, s2: { x: 1, y: 5 }, s3: { x: 100, y: 0 } },
      ["s1", "s2"],
      keys,
    );
    expect(out.x.score).toBe(out.y.score);
    expect(out.x.parts.map((p) => p.sourceId)).toEqual(["s1", "s2"]);
  });
});

function model(): MapModel {
  const base = {
    borough: "Manhattan",
    polygon: [],
    value: 0,
    height: 0,
    nightShare: 0,
    noiseCount: 0,
    crashCount: 0,
    injured: 0,
    killed: 0,
    cyclists: 0,
    addresses: [],
    streets: [],
  };
  return {
    layer: "combined",
    scale: "neighborhoods",
    neighborhoods: [
      { ...base, id: "A", ntaCode: "A", ntaName: "A" },
      { ...base, id: "B", ntaCode: "B", ntaName: "B" },
    ],
    blocks: [],
    maxValue: 0,
    areasWithData: 0,
  };
}

function counts(id: string, byNta: Record<string, number>): SourceCounts {
  return {
    sourceId: id,
    byNta,
    blocks: { "1:2": { lat: 40.7, lon: -73.9, ntaCode: "A", count: 3 } },
    total: 1,
    truncated: false,
    sources: [],
  };
}

describe("applyView", () => {
  it("leaves the classic view alone", () => {
    const m = model();
    expect(applyView(m, { kind: "legacy" }, {})).toBe(m);
  });

  it("re-scores a single source and records its breakdown", () => {
    const out = applyView(model(), { kind: "source", sourceId: "hpd" }, { hpd: counts("hpd", { A: 7 }) });
    expect(out.neighborhoods[0].value).toBe(7);
    expect(out.neighborhoods[1].value).toBe(0);
    expect(out.neighborhoods[0].height).toBeGreaterThan(0);
    expect(out.view?.contributors).toEqual(["hpd"]);
    expect(out.blocks).toHaveLength(1);
  });

  it("builds an average from the ticked sources", () => {
    const out = applyView(
      model(),
      { kind: "average", sourceIds: ["hpd", "311", "trees"] },
      { hpd: counts("hpd", { A: 7, B: 1 }), "311": counts("311", { A: 1, B: 9 }) },
    );
    // trees is not loaded, so it is not a contributor.
    expect(out.view?.contributors).toEqual(["hpd", "311"]);
    expect(out.neighborhoods[0].value).toBe(out.neighborhoods[1].value);
    expect(out.neighborhoods[0].breakdown).toHaveLength(2);
  });

  it("round-trips the URL form", () => {
    expect(parseViewMode(viewModeToParam({ kind: "source", sourceId: "trees" }), [])).toEqual({
      kind: "source",
      sourceId: "trees",
    });
    expect(parseViewMode("src:nope", [])).toEqual({ kind: "legacy" });
    expect(parseViewMode("avg", ["hpd"])).toEqual({ kind: "average", sourceIds: ["hpd"] });
  });
});

describe("routeUrl", () => {
  it("asks OSRM's foot profile for a GeoJSON line", () => {
    const url = routeUrl({ lon: -73.98, lat: 40.75 }, { lon: -73.97, lat: 40.76 });
    expect(url).toContain("/routed-foot/route/v1/foot/-73.980000,40.750000;-73.970000,40.760000");
    expect(url).toContain("geometries=geojson");
  });
});
