import { describe, expect, it, vi } from "vitest";
import { jumpToNeighborhood, neighborhoodCameraTarget } from "./neighborhoodJump";

describe("jumpToNeighborhood", () => {
  const options = [{ code: "BK0101", bbox: [-74.0, 40.7, -73.9, 40.8] as [number, number, number, number] }];

  it("moves the map to the chosen neighborhood, not just selects it", () => {
    const actions = { selectNta: vi.fn(), setDetailsExpanded: vi.fn(), flyTo: vi.fn() };
    jumpToNeighborhood("BK0101", options, actions);
    expect(actions.selectNta).toHaveBeenCalledWith("BK0101");
    expect(actions.setDetailsExpanded).toHaveBeenCalledWith(true);
    expect(actions.flyTo).toHaveBeenCalledWith({ lon: -73.95, lat: 40.75, zoom: 13.5 });
  });

  it("still selects when the code has no known bounds", () => {
    const actions = { selectNta: vi.fn(), setDetailsExpanded: vi.fn(), flyTo: vi.fn() };
    jumpToNeighborhood("XX9999", options, actions);
    expect(actions.selectNta).toHaveBeenCalledWith("XX9999");
    expect(actions.flyTo).not.toHaveBeenCalled();
  });
});

describe("neighborhoodCameraTarget", () => {
  it("centres on the bounding box", () => {
    expect(neighborhoodCameraTarget([-74.0, 40.7, -73.9, 40.8])).toEqual({ lon: -73.95, lat: 40.75, zoom: 13.5 });
  });
});
