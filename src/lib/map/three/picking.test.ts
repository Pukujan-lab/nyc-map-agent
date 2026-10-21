import { describe, expect, it } from "vitest";
import { directoryAt, hydrantFacing, nearbyHydrants, nearbySigns, nearbyStorefronts, storefrontAt } from "./picking";

const C = { lng: -73.99, lat: 40.73 };
const dLat = (m: number) => m / 111_195;
const dLng = (m: number) => m / (111_195 * Math.cos((C.lat * Math.PI) / 180));
const pt = (east: number, north: number, properties: Record<string, unknown>) => ({
  geometry: { type: "Point", coordinates: [C.lng + dLng(east), C.lat + dLat(north)] }, properties,
});
const square = (east: number, north: number, properties: Record<string, unknown>) => {
  const [x, y] = [C.lng + dLng(east), C.lat + dLat(north)], h = dLng(0.2);
  return { geometry: { type: "Polygon", coordinates: [[[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h], [x - h, y - h]]] }, properties };
};

function fakeMap(layers: Record<string, unknown[]>, zoom = 18, source = true) {
  const calls: Array<{ sourceLayer: string; filter?: unknown }> = [];
  const map = {
    getCenter: () => C,
    getZoom: () => zoom,
    getSource: () => (source ? {} : undefined),
    querySourceFeatures: (_id: string, opts: { sourceLayer: string; filter?: unknown }) => { calls.push(opts); return layers[opts.sourceLayer] ?? []; },
  };
  return { map: map as never, calls };
}

describe("three/picking", () => {
  it("picks storefront signs nearest first, within the radius, deduplicated across tile edges", () => {
    const shop = (e: number, n: number, name: string, extra = {}) => pt(e, n, { name, cat: "shop", brg: 0, sw: 4, fl: 0, ...extra });
    const { map } = fakeMap({ storefronts: [shop(50, 0, "Far"), shop(5, 0, "Near"), shop(5, 0, "Near"), shop(400, 0, "Out")] });
    const got = nearbyStorefronts(map);
    expect(got.map((s) => s.name)).toEqual(["Near", "Far"]);
    expect(nearbyStorefronts(map, 200, 1).map((s) => s.name)).toEqual(["Near"]);
  });

  it("storefrontAt and directoryAt pick at a clicked point", () => {
    const at = C.lng + dLng(100), lat = C.lat;
    const { map } = fakeMap({
      storefronts: [pt(100, 5, { name: "Deli", cat: "food", brg: 0, sw: 3, fl: 0 }), pt(100, 15, { name: "Mall", cat: "mall", brg: 0, sw: 8, fl: 0, main: 1 })],
    });
    expect(storefrontAt(map, at, lat)?.name).toBe("Deli");
    expect(storefrontAt(map, at, lat + dLat(40))).toBeNull();
    expect(directoryAt(map, at, lat)?.name).toBe("Mall");
    expect(directoryAt(fakeMap({}, 15).map, at, lat)).toBeNull(); // below STOREFRONT_MIN_ZOOM
    expect(nearbyStorefronts(fakeMap({ storefronts: [pt(1, 1, { name: "x" })] }, 18, false).map)).toEqual([]); // no city3d source
  });

  it("finds hydrants by polygon centroid, filtered to kind = hydrant, with a stable facing", () => {
    const { map, calls } = fakeMap({ props: [square(30, 0, { kind: "hydrant" }), square(-10, 0, { kind: "hydrant" }), square(-10, 0, { kind: "hydrant" }), square(500, 0, { kind: "hydrant" })] });
    const got = nearbyHydrants(map);
    expect(got).toHaveLength(2);
    expect(got[0].lon).toBeCloseTo(C.lng + dLng(-10), 9);
    expect(got[0].facing).toBe(hydrantFacing(got[0].lon, got[0].lat));
    expect([0, 90, 180, 270, 360]).toContain(got[0].facing);
    expect(calls[0].filter).toEqual(["==", ["get", "kind"], "hydrant"]);
    expect(nearbyHydrants(fakeMap({ props: [square(1, 1, {})] }, 15).map)).toEqual([]); // below HYDRANT_MIN_ZOOM
  });

  it("finds corner signs nearest first within 300 m", () => {
    const corner = (e: number, n: number) => pt(e, n, { a: "Canal St", b: "Broadway", ba: 61, bb: 331 });
    const got = nearbySigns(fakeMap({ signs: [corner(120, 0), corner(20, 0), corner(20, 0), corner(0, 320)] }).map);
    expect(got.map((s) => Math.round((s.lng - C.lng) / dLng(1)))).toEqual([20, 120]);
    expect(got[0]).toMatchObject({ a: "Canal St", b: "Broadway", ba: 61, bb: 331 });
  });
});
