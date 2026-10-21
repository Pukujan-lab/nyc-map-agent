import { describe, expect, it } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import { TALLEST_BUILDING_M, setTallTileCover } from "./tallTileCover";

class Box { constructor(public min: number[], public max: number[]) {} }
class Provider { getTileBoundingVolume() { return new Box([0, 0, 0], [1, 1, 0]); } }

describe("tall tile cover", () => {
  it("raises flat tile boxes to the tallest building only at street level", () => {
    const provider = new Provider();
    const map = { transform: { getCoveringTilesDetailsProvider: () => provider }, triggerRepaint: () => {} } as unknown as MaplibreMap;
    setTallTileCover(map, true);
    const fresh = new Provider(); // a cloned transform's provider shares the patched class
    expect((fresh.getTileBoundingVolume as (...a: unknown[]) => Box)({}, 0, 0, {}).max[2]).toBe(TALLEST_BUILDING_M);
    setTallTileCover(map, false);
    expect((fresh.getTileBoundingVolume as (...a: unknown[]) => Box)({}, 0, 0, {}).max[2]).toBe(0);
    setTallTileCover(map, true);
    expect((fresh.getTileBoundingVolume as (...a: unknown[]) => Box)({}, 0, 0, { terrain: {} }).max[2]).toBe(0);
  });
});
