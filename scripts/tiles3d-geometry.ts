/**
 * Pure geometry for the self-hosted 3D Tiles build (scripts/build-3dtiles.ts):
 * building footprint + roof height -> extruded mesh -> binary glTF (GLB), plus
 * the East-North-Up to Earth-fixed transform a tileset needs. No I/O and no
 * external tools, so it is unit-tested directly.
 */
export const FT_TO_M = 0.3048;
/** Used when a footprint row has no usable roof height (sheds, garages). */
export const DEFAULT_HEIGHT_M = 6;

const WGS84_A = 6378137;
const WGS84_E2 = 0.00669437999014;

/** NYC Building Footprints `base_bbl` starts with the borough digit. */
export const BOROUGHS: Record<string, number> = {
  manhattan: 1,
  bronx: 2,
  brooklyn: 3,
  queens: 4,
  "staten-island": 5,
};

export function boroughCode(name: string): number | null {
  return BOROUGHS[name.trim().toLowerCase().replace(/\s+/g, "-")] ?? null;
}

/** Roof height in metres from the footprint dataset's feet value. */
export function heightMeters(heightRoofFt: unknown): number {
  const h = Number(heightRoofFt) * FT_TO_M;
  return Number.isFinite(h) && h >= 1 ? h : DEFAULT_HEIGHT_M;
}

export type LonLat = [number, number];
export type XY = [number, number];
export interface Origin {
  lon: number;
  lat: number;
}

/** lon/lat degrees to east/north metres around `origin` (local tangent plane approximation, fine at borough scale). */
export function toLocalMeters(p: LonLat, origin: Origin): XY {
  const lat0 = (origin.lat * Math.PI) / 180;
  const sin = Math.sin(lat0);
  const w = Math.sqrt(1 - WGS84_E2 * sin * sin);
  const mPerDegLat = ((Math.PI / 180) * WGS84_A * (1 - WGS84_E2)) / (w * w * w);
  const mPerDegLon = ((Math.PI / 180) * WGS84_A * Math.cos(lat0)) / w;
  return [(p[0] - origin.lon) * mPerDegLon, (p[1] - origin.lat) * mPerDegLat];
}

export function signedArea(ring: XY[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Drops the GeoJSON closing vertex and repeated points, and returns a counter-clockwise ring (or null if degenerate). */
export function cleanRing(ring: XY[]): XY[] | null {
  const out: XY[] = [];
  for (const p of ring) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-6) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && out.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6) out.pop();
  if (out.length < 3) return null;
  const area = signedArea(out);
  if (Math.abs(area) < 1e-3) return null;
  return area > 0 ? out : out.reverse();
}

function cross(o: XY, a: XY, b: XY): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function inTriangle(p: XY, a: XY, b: XY, c: XY): boolean {
  return cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
}

/** Ear-clipping triangulation of a simple counter-clockwise ring. Returns indices into `ring`. Footprints are small, so O(n^2) is fine. */
export function triangulate(ring: XY[]): number[] {
  const idx = ring.map((_, i) => i);
  const tris: number[] = [];
  let guard = ring.length * ring.length;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = ring[ia];
      const b = ring[ib];
      const c = ring[ic];
      if (cross(a, b, c) <= 0) continue; // reflex or collinear
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inTriangle(ring[j], a, b, c))) continue;
      tris.push(ia, ib, ic);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // Self-touching or degenerate input: drop one vertex so the loop always ends.
      const [ia, ib, ic] = [idx[idx.length - 1], idx[0], idx[1]];
      if (cross(ring[ia], ring[ib], ring[ic]) > 0) tris.push(ia, ib, ic);
      idx.shift();
    }
  }
  if (idx.length === 3 && cross(ring[idx[0]], ring[idx[1]], ring[idx[2]]) > 0) tris.push(idx[0], idx[1], idx[2]);
  return tris;
}

export interface Mesh {
  /** x east, y north, z up (metres), flat xyz triples */
  positions: number[];
  normals: number[];
  indices: number[];
}

export function emptyMesh(): Mesh {
  return { positions: [], normals: [], indices: [] };
}

/** Appends a prism: flat roof at `heightM` and walls down to z = 0. `ring` is cleaned CCW metres. Holes (courtyards) are ignored. */
export function extrudeRing(mesh: Mesh, ring: XY[], heightM: number): void {
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    mesh.positions.push(x, y, z);
    mesh.normals.push(nx, ny, nz);
    return mesh.positions.length / 3 - 1;
  };
  const base = mesh.positions.length / 3;
  for (const [x, y] of ring) push(x, y, heightM, 0, 0, 1);
  for (const t of triangulate(ring)) mesh.indices.push(base + t);
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len === 0) continue;
    const nx = (y2 - y1) / len;
    const ny = -(x2 - x1) / len;
    const a0 = push(x1, y1, 0, nx, ny, 0);
    const b0 = push(x2, y2, 0, nx, ny, 0);
    const b1 = push(x2, y2, heightM, nx, ny, 0);
    const a1 = push(x1, y1, heightM, nx, ny, 0);
    mesh.indices.push(a0, b0, b1, a0, b1, a1);
  }
}

/** Binary glTF 2.0. Input is ENU (z up); glTF is Y-up, and 3D Tiles rotates glTF Y-up back to Z-up, so (e, n, u) is stored as (e, u, -n). */
export function meshToGlb(mesh: Mesh): Buffer {
  const vertexCount = mesh.positions.length / 3;
  const pos = new Float32Array(mesh.positions.length);
  const nor = new Float32Array(mesh.normals.length);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertexCount; i++) {
    const p = [mesh.positions[i * 3], mesh.positions[i * 3 + 2], -mesh.positions[i * 3 + 1]];
    const n = [mesh.normals[i * 3], mesh.normals[i * 3 + 2], -mesh.normals[i * 3 + 1]];
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = p[k]!;
      nor[i * 3 + k] = n[k]!;
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
  const idx = new Uint32Array(mesh.indices);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nor.buffer), Buffer.from(idx.buffer)]);
  const json = {
    asset: { version: "2.0", generator: "nyc-map-agent build-3dtiles" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0, mode: 4 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.78, 0.76, 0.72, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertexCount, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: vertexCount, type: "VEC3" },
      { bufferView: 2, componentType: 5125, count: idx.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pos.byteLength, byteLength: nor.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pos.byteLength + nor.byteLength, byteLength: idx.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  const pad = (b: Buffer, fill: number) => (b.length % 4 === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]));
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const binChunk = pad(bin, 0);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHead = (len: number, type: string) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(len, 0);
    h.write(type, 4, "latin1");
    return h;
  };
  return Buffer.concat([header, chunkHead(jsonChunk.length, "JSON"), jsonChunk, chunkHead(binChunk.length, "BIN\0"), binChunk]);
}

/** Column-major 4x4 taking local East-North-Up metres at (lon, lat) on the ellipsoid to Earth-fixed (ECEF) coordinates. */
export function enuToEcefTransform(lonDeg: number, latDeg: number, heightM = 0): number[] {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const sl = Math.sin(lat);
  const cl = Math.cos(lat);
  const so = Math.sin(lon);
  const co = Math.cos(lon);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sl * sl);
  const x = (n + heightM) * cl * co;
  const y = (n + heightM) * cl * so;
  const z = (n * (1 - WGS84_E2) + heightM) * sl;
  return [-so, co, 0, 0, -sl * co, -sl * so, cl, 0, cl * co, cl * so, sl, 0, x, y, z, 1];
}

export interface Placed {
  ring: XY[];
  heightM: number;
}

export interface TileCell {
  key: string;
  buildings: Placed[];
}

/** Buckets buildings into square `cellM` cells by footprint centroid (a flat grid: one tile per cell). */
export function gridCells(buildings: Placed[], cellM: number): TileCell[] {
  const cells = new Map<string, TileCell>();
  for (const b of buildings) {
    let cx = 0;
    let cy = 0;
    for (const [x, y] of b.ring) {
      cx += x;
      cy += y;
    }
    cx /= b.ring.length;
    cy /= b.ring.length;
    const key = `${Math.floor(cx / cellM)}_${Math.floor(cy / cellM)}`;
    const cell = cells.get(key) ?? { key, buildings: [] };
    cell.buildings.push(b);
    cells.set(key, cell);
  }
  return [...cells.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** 3D Tiles `box` bounding volume (centre, then three half-axes) in the tileset's ENU frame. */
export function boundingBox(buildings: Placed[]): number[] {
  let [x0, y0, x1, y1, z1] = [Infinity, Infinity, -Infinity, -Infinity, 0];
  for (const b of buildings) {
    z1 = Math.max(z1, b.heightM);
    for (const [x, y] of b.ring) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2, z1 / 2, (x1 - x0) / 2, 0, 0, 0, (y1 - y0) / 2, 0, 0, 0, z1 / 2];
}

export function unionBox(boxes: number[][]): number[] {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    const half = [b[3], b[7], b[11]];
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], b[k] - half[k]);
      hi[k] = Math.max(hi[k], b[k] + half[k]);
    }
  }
  return [
    (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2,
    (hi[0] - lo[0]) / 2, 0, 0, 0, (hi[1] - lo[1]) / 2, 0, 0, 0, (hi[2] - lo[2]) / 2,
  ];
}

export function buildTileset(origin: Origin, tiles: Array<{ uri: string; box: number[] }>, geometricError = 400) {
  return {
    asset: { version: "1.1" },
    geometricError: geometricError * 2,
    root: {
      transform: enuToEcefTransform(origin.lon, origin.lat),
      boundingVolume: { box: unionBox(tiles.map((t) => t.box)) },
      geometricError,
      refine: "ADD",
      children: tiles.map((t) => ({ boundingVolume: { box: t.box }, geometricError: 0, content: { uri: t.uri } })),
    },
  };
}
