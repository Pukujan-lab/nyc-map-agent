import { describe, expect, it } from "vitest";
import { outerRings } from "./build-3dtiles";
import {
  boroughCode, boundingBox, buildTileset, cleanRing, emptyMesh, enuToEcefTransform, extrudeRing, gridCells,
  heightMeters, meshToGlb, signedArea, toLocalMeters, triangulate, DEFAULT_HEIGHT_M, type XY,
} from "./tiles3d-geometry";

const square: XY[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
const lShape: XY[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
const triArea = (ring: XY[], t: number[]) => {
  let a = 0;
  for (let i = 0; i < t.length; i += 3) a += signedArea([ring[t[i]!]!, ring[t[i + 1]!]!, ring[t[i + 2]!]!]);
  return a;
};

describe("3D tiles geometry", () => {
  it("maps borough names and converts feet to metres with a fallback", () => {
    expect(boroughCode("Staten Island")).toBe(5);
    expect(boroughCode("atlantis")).toBeNull();
    expect(heightMeters("100")).toBeCloseTo(30.48);
    expect(heightMeters(undefined)).toBe(DEFAULT_HEIGHT_M);
    expect(heightMeters("0")).toBe(DEFAULT_HEIGHT_M);
  });
  it("projects lon/lat to local metres", () => {
    const o = { lon: -74, lat: 40.7 };
    const [e, n] = toLocalMeters([-74, 40.701], o);
    expect(e).toBeCloseTo(0);
    expect(n).toBeGreaterThan(110);
    expect(n).toBeLessThan(112);
    expect(toLocalMeters([-73.999, 40.7], o)[0]).toBeGreaterThan(84);
  });
  it("cleans rings: closing vertex dropped, wound counter-clockwise, degenerate rejected", () => {
    const closedCw: XY[] = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
    const r = cleanRing(closedCw)!;
    expect(r).toHaveLength(4);
    expect(signedArea(r)).toBeCloseTo(100);
    expect(cleanRing([[0, 0], [1, 1], [2, 2]])).toBeNull();
    expect(cleanRing([[0, 0], [1, 0]])).toBeNull();
  });
  it("triangulates convex and concave rings with no area lost", () => {
    expect(triArea(square, triangulate(square))).toBeCloseTo(100);
    const t = triangulate(lShape);
    expect(t).toHaveLength(12);
    expect(triArea(lShape, t)).toBeCloseTo(signedArea(lShape));
  });
  it("extrudes a prism with an up-facing roof and outward walls", () => {
    const m = emptyMesh();
    extrudeRing(m, square, 20);
    expect(m.positions.length / 3).toBe(4 + 4 * 4);
    expect(m.indices.length / 3).toBe(2 + 4 * 2);
    expect(Math.max(...m.positions.filter((_, i) => i % 3 === 2))).toBe(20);
    // first wall runs along +x at y=0, so its outward normal is -y
    expect(m.normals.slice(12, 15)).toEqual([0, -1, 0]);
  });
  it("writes a valid GLB container", () => {
    const m = emptyMesh();
    extrudeRing(m, square, 20);
    const glb = meshToGlb(m);
    expect(glb.toString("ascii", 0, 4)).toBe("glTF");
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    expect(glb.length % 4).toBe(0);
    const jsonLen = glb.readUInt32LE(12);
    const json = JSON.parse(glb.toString("utf8", 20, 20 + jsonLen));
    expect(json.accessors[0].count).toBe(m.positions.length / 3);
    expect(json.accessors[0].max[1]).toBe(20); // height stored on glTF Y
  });
  it("builds an ENU->ECEF transform, grid cells, and a tileset", () => {
    const t = enuToEcefTransform(-74, 40.7);
    expect(t).toHaveLength(16);
    expect(Math.hypot(t[12]!, t[13]!, t[14]!)).toBeGreaterThan(6.3e6);
    const cells = gridCells([{ ring: square, heightM: 5 }, { ring: square.map(([x, y]) => [x + 5000, y] as XY), heightM: 9 }], 1000);
    expect(cells).toHaveLength(2);
    const box = boundingBox(cells[0]!.buildings);
    expect(box.slice(0, 3)).toEqual([5, 5, 2.5]);
    const ts = buildTileset({ lon: -74, lat: 40.7 }, [{ uri: "a.glb", box }]);
    expect(ts.asset.version).toBe("1.1");
    expect(ts.root.children[0]!.content.uri).toBe("a.glb");
  });
  it("reads outer rings from Polygon and MultiPolygon", () => {
    const p = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]], [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.1]]] };
    expect(outerRings(p)).toHaveLength(1);
    expect(outerRings({ type: "MultiPolygon", coordinates: [p.coordinates, p.coordinates] })).toHaveLength(2);
    expect(outerRings(undefined)).toEqual([]);
  });
});
