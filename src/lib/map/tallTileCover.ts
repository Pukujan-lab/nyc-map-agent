import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Why buildings vanished when looking up at street level (#153's look-up):
 * MapLibre picks which vector tiles to load and draw by testing each tile's
 * bounding box against the camera frustum, and with no terrain that box is
 * flat at height 0 (mercator covering-tiles details provider,
 * `getTileBoundingVolume`). Look more than about 25° above the horizon and the
 * pavement leaves the view, every tile fails the test, the tile list goes to
 * zero and every fill-extrusion building goes with it, even though the towers
 * themselves are still in view.
 *
 * The fix gives tile boxes the height of the tallest building while at street
 * level, so a tile whose towers are in view counts as visible. It wraps the
 * provider's method once (MapLibre exposes no option for it); overhead views
 * keep the stock flat boxes.
 */
export const TALLEST_BUILDING_M = 560;

type Box = { min: number[]; max: number[] };
type Provider = { getTileBoundingVolume: (tile: unknown, wrap: number, elevation: number, options?: { terrain?: unknown }) => Box };

let tall = false;
let wrapped = false;

/** Turn tall tile boxes on (street level) or off (overhead). */
export function setTallTileCover(map: MaplibreMap, on: boolean): void {
  tall = on;
  if (!wrapped) wrap(map);
  map.triggerRepaint();
}

function wrap(map: MaplibreMap): void {
  const tr = (map as unknown as { transform?: { getCoveringTilesDetailsProvider?: () => Provider } }).transform;
  const provider = tr?.getCoveringTilesDetailsProvider?.();
  if (!provider) return;
  // Patch the class, so clones of the transform (MapLibre makes them) agree.
  const proto = Object.getPrototypeOf(provider) as Provider;
  const original = proto.getTileBoundingVolume;
  if (typeof original !== "function") return;
  proto.getTileBoundingVolume = function (this: Provider, tile, w, elevation, options) {
    const box = original.call(this, tile, w, elevation, options);
    if (!tall || options?.terrain || box.max[2] >= TALLEST_BUILDING_M) return box;
    const Ctor = box.constructor as new (min: number[], max: number[]) => Box;
    return new Ctor(box.min, [box.max[0], box.max[1], TALLEST_BUILDING_M]);
  };
  wrapped = true;
}
