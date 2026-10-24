import { describe, expect, it } from "vitest";
import type { MapContext } from "./context";
import { ContextOverrides, dimValue, focusValue, layersOf, planOps, type MapLike } from "./apply";

type Layer = { id: string; type: string; layout: Record<string, unknown>; paint: Record<string, unknown> };

/** A fake MapLibre map: an ordered list of layers with layout and paint bags. */
function fakeMap(spec: [string, string, Record<string, unknown>?][]): MapLike & { layers: Layer[]; writes: number } {
  const layers: Layer[] = spec.map(([id, type, paint]) => ({ id, type, layout: {}, paint: { ...paint } }));
  const find = (id: string) => layers.find((l) => l.id === id);
  const m = {
    layers,
    writes: 0,
    getLayersOrder: () => layers.map((l) => l.id),
    getLayer: (id: string) => find(id),
    getLayoutProperty: (id: string, p: string) => find(id)?.layout[p],
    setLayoutProperty: (id: string, p: string, v: unknown) => { m.writes++; find(id)!.layout[p] = v; },
    getPaintProperty: (id: string, p: string) => find(id)?.paint[p],
    setPaintProperty: (id: string, p: string, v: unknown) => { m.writes++; find(id)!.paint[p] = v; },
  };
  return m;
}

const subwayF: MapContext = { kind: "following", system: "subway", route: "F" };
const scene = () =>
  fakeMap([
    ["water", "fill"],
    ["road_minor", "line", { "line-opacity": 0.8 }],
    ["transit-line", "line", { "line-opacity": 0.9 }],
    ["transit-bus-notch", "symbol", { "icon-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.5, 0.8] }],
    ["transit-bullet", "symbol"],
    ["transit-entrance", "circle"],
    ["poi_r20", "symbol"],
    ["landmark-labels", "symbol"],
  ]);
const snapshot = (m: { layers: Layer[] }) => JSON.stringify(m.layers);

describe("opacity rewrites", () => {
  it("scales numbers and wraps expressions", () => {
    expect(dimValue(0.8, 0.5)).toBe(0.4);
    expect(dimValue(undefined, 0.5)).toBe(0.5);
    expect(dimValue(["get", "alpha"], 0.5)).toEqual(["*", ["get", "alpha"], 0.5]);
  });
  it("keeps a zoom curve top-level and rewrites its stops", () => {
    const v = ["interpolate", ["linear"], ["zoom"], 10, 0.2, 16, ["get", "a"]];
    expect(dimValue(v, 0.5)).toEqual(["interpolate", ["linear"], ["zoom"], 10, 0.1, 16, ["*", ["get", "a"], 0.5]]);
    expect(dimValue(["step", ["zoom"], 0, 13, 1], 0.5)).toEqual(["step", ["zoom"], 0, 13, 0.5]);
    expect(focusValue(["step", ["zoom"], 0, 13, 1], ["==", 1, 1])).toEqual(["step", ["zoom"], ["case", ["==", 1, 1], 0, 0], 13, ["case", ["==", 1, 1], 1, 0]]);
  });
});

describe("planOps", () => {
  it("asks for nothing while browsing", () => {
    expect(planOps(layersOf(scene()), { kind: "browsing" })).toEqual([]);
  });
  it("never touches landmark- or basemap layers", () => {
    const touched = new Set(planOps(layersOf(scene()), subwayF).map((o) => o.layer));
    expect(touched.has("landmark-labels")).toBe(false);
    expect(touched.has("water")).toBe(false);
  });
});

describe("ContextOverrides", () => {
  it("applies a follow context and restores the map exactly on exit", () => {
    const m = scene();
    const before = snapshot(m);
    const o = new ContextOverrides(m);
    o.sync(planOps(layersOf(m), subwayF));
    const get = (id: string) => m.layers.find((l) => l.id === id)!;
    expect(get("poi_r20").layout.visibility).toBe("none");
    expect(get("transit-bus-notch").layout.visibility).toBe("none");
    expect(get("transit-entrance").layout.visibility).toBe("none"); // no route on it: focus hides it
    expect(get("road_minor").paint["line-opacity"]).toBe(0.24);
    expect(get("transit-line").paint["line-opacity"]).toEqual(["case", ["in", ["to-string", ["coalesce", ["get", "route"], ""]], ["literal", ["F"]]], 0.9, 0]);
    expect(get("landmark-labels").layout.visibility).toBeUndefined();
    o.restoreAll();
    expect(o.size).toBe(0);
    // Visibility comes back as "visible" (the default), everything else exactly as it was.
    const restored = JSON.parse(snapshot(m)) as Layer[];
    for (const l of restored) if (l.layout.visibility === "visible") delete l.layout.visibility;
    expect(JSON.stringify(restored)).toBe(before);
  });

  it("is idempotent: a second sync writes nothing", () => {
    const m = scene();
    const o = new ContextOverrides(m);
    o.sync(planOps(layersOf(m), subwayF));
    const n = m.writes;
    o.sync(planOps(layersOf(m), subwayF));
    expect(m.writes).toBe(n);
  });

  it("moves between contexts from the original values, never stacking overrides", () => {
    const m = scene();
    const o = new ContextOverrides(m);
    o.sync(planOps(layersOf(m), subwayF));
    o.sync(planOps(layersOf(m), { kind: "trip" }));
    const line = m.layers.find((l) => l.id === "transit-line")!;
    expect(line.paint["line-opacity"]).toBe(0.27); // 0.9 × 0.3, not the focus expression × 0.3
    o.sync(planOps(layersOf(m), { kind: "walking" }));
    expect(line.layout.visibility).toBe("none");
    expect(line.paint["line-opacity"]).toBe(0.9);
  });

  it("adopts a value the app sets underneath it, and restores that one", () => {
    const m = scene();
    const o = new ContextOverrides(m);
    o.sync(planOps(layersOf(m), subwayF));
    m.layers.find((l) => l.id === "road_minor")!.paint["line-opacity"] = 0.5; // e.g. a React prop change
    o.sync(planOps(layersOf(m), subwayF));
    expect(m.layers.find((l) => l.id === "road_minor")!.paint["line-opacity"]).toBe(0.15);
    o.restoreAll();
    expect(m.layers.find((l) => l.id === "road_minor")!.paint["line-opacity"]).toBe(0.5);
  });

  it("leaves a layer the user switched off still off after restore", () => {
    const m = scene();
    m.layers.find((l) => l.id === "poi_r20")!.layout.visibility = "none";
    const o = new ContextOverrides(m);
    o.sync(planOps(layersOf(m), subwayF));
    o.restoreAll();
    expect(m.layers.find((l) => l.id === "poi_r20")!.layout.visibility).toBe("none");
  });

  it("picks up layers that arrive later and forgets removed ones", () => {
    const m = scene();
    const o = new ContextOverrides(m);
    o.sync(planOps(layersOf(m), subwayF));
    m.layers.push({ id: "events-pin", type: "symbol", layout: {}, paint: {} });
    m.layers.splice(m.layers.findIndex((l) => l.id === "poi_r20"), 1);
    o.sync(planOps(layersOf(m), subwayF));
    expect(m.layers.find((l) => l.id === "events-pin")!.layout.visibility).toBe("none");
    expect(() => o.restoreAll()).not.toThrow();
  });
});
