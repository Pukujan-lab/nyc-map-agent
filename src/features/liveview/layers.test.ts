import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { updateNavLayers, type NavFrame } from "./layers";

function fakeMap() {
  const data: Record<string, GeoJSON.FeatureCollection> = {};
  const map = {
    getSource: (id: string) => ({ setData: vi.fn((d: GeoJSON.FeatureCollection) => { data[id] = d; return Promise.resolve(); }) }),
    getZoom: () => 18,
  } as unknown as MapLibreMap;
  return { map, data };
}

const frame: NavFrame = {
  route: { coordinates: [[-73.99, 40.75], [-73.98, 40.76]], steps: [] } as unknown as NavFrame["route"],
  along: 0,
  next: null,
  puck: null,
};

describe("destination pin over the camera (#192)", () => {
  it("stands at the route's end in Live View", () => {
    const { map, data } = fakeMap();
    updateNavLayers(map, { ...frame, destPin: true });
    const pin = data["nav-dest"].features;
    expect(pin).toHaveLength(1);
    expect(pin[0].geometry).toEqual({ type: "Point", coordinates: [-73.98, 40.76] });
  });

  it("is left off the map, which marks the destination already", () => {
    const { map, data } = fakeMap();
    updateNavLayers(map, frame);
    expect(data["nav-dest"].features).toHaveLength(0);
  });
});
