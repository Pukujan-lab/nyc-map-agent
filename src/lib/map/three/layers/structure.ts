/** Elevated structure (viaduct bays, merged per ~1 km chunk) and street-entrance kits for the vehicle layer. */
import * as THREE from "three";
import { bearingToZ, toLocal, type Frame } from "../projection";

/** One viaduct bay; mirrors `Bay` in features/transit/model.ts (shared lib must not import features). */
export interface BayInstance {
  lon: number;
  lat: number;
  bearing: number;
  top: number;
  len: number;
  station: boolean;
}
/** Structure is drawn at and above this zoom; below it the caller's raised line stands in. */
export const STRUCTURE_MINZOOM = 15;
const CHUNK = 0.01; // degrees, ~1 km
const CHUNK_RADIUS = 1; // chunks around the camera centre to keep built

type Part = { w: number; l: number; h: number; x: number; z: number; color: string };
/** Parts in bay-local metres: x across the track, y along it, z up from the deck top. */
function bayParts(top: number, len: number, station: boolean): Part[] {
  const steel = "#36413a", rail = "#a3a3a3";
  const parts: Part[] = [
    { w: 0.9, l: 0.9, h: top - 1.4, x: -3.2, z: -top, color: steel },
    { w: 0.9, l: 0.9, h: top - 1.4, x: 3.2, z: -top, color: steel },
    { w: 7.6, l: 0.7, h: 0.6, x: 0, z: -1.6, color: steel }, // cap beam on the columns
    { w: 0.5, l: len, h: 1.4, x: -3.6, z: -1.4, color: steel },
    { w: 0.5, l: len, h: 1.4, x: 3.6, z: -1.4, color: steel },
    { w: 7.2, l: len, h: 0.3, x: 0, z: -0.3, color: "#44403c" },
  ];
  for (const cx of [-1.9, 1.9]) for (const off of [-0.72, 0.72]) parts.push({ w: 0.12, l: len, h: 0.18, x: cx + off, z: 0, color: rail });
  if (station) {
    for (const sx of [-1, 1]) {
      parts.push({ w: 3, l: len, h: 1.1, x: sx * 5.4, z: -0.3, color: "#d6d3d1" }); // platform
      parts.push({ w: 0.12, l: len, h: 2.4, x: sx * 6.9, z: 0.8, color: "#94a3b8" }); // windscreen
      parts.push({ w: 0.25, l: 0.25, h: 3.4, x: sx * 6.6, z: 0.8, color: "#475569" }); // canopy post
      parts.push({ w: 3.6, l: len, h: 0.2, x: sx * 5.6, z: 4.2, color: "#475569" }); // canopy
    }
  }
  return parts;
}
/** Street entrance for the 3D kit (mirrors EntranceInstance in features/transit/model.ts). */
export interface EntranceKitInstance {
  lon: number;
  lat: number;
  bearing: number;
  kind: "stair" | "elevator";
  out: boolean;
}
const ENTRANCE_CAP = 300;
/** Merge coloured boxes [w,l,h,x,y,z,color] (z = base) into one geometry; spheres for globe lamps. */
function kit(boxes: Array<[number, number, number, number, number, number, string]>, globes: Array<[number, number, number]>): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g;
  };
  for (const [w, l, h, x, y, z, c] of boxes) parts.push(paint(new THREE.BoxGeometry(w, l, h).toNonIndexed().translate(x, y, z + h / 2), c));
  for (const [x, y, z] of globes) {
    parts.push(paint(new THREE.CylinderGeometry(0.05, 0.05, z, 4).rotateX(Math.PI / 2).toNonIndexed().translate(x, y, z / 2), "#1f2937"));
    parts.push(paint(new THREE.SphereGeometry(0.3, 8, 6).toNonIndexed().translate(x, y, z + 0.15), "#22c55e"));
  }
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const g of parts) {
    g.computeVertexNormals();
    pos.push(...(g.attributes.position.array as Float32Array)); nor.push(...(g.attributes.normal.array as Float32Array)); col.push(...(g.attributes.color.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return out;
}
/** Low-poly NYC stair entrance, local y = toward the station: railings, descending steps, globe lamps, sign. */
function stairKit(): THREE.BufferGeometry {
  const rail = "#15803d", step = "#9ca3af";
  const boxes: Array<[number, number, number, number, number, number, string]> = [
    [0.12, 4.2, 1.1, -1.2, 0.6, 0.25, rail], [0.12, 4.2, 1.1, 1.2, 0.6, 0.25, rail], [2.5, 0.12, 1.1, 0, -1.7, 0.25, rail],
    // Granite coping around the opening so it reads from a distance.
    [0.35, 4.6, 0.25, -1.2, 0.6, 0, "#a8a29e"], [0.35, 4.6, 0.25, 1.2, 0.6, 0, "#a8a29e"], [2.75, 0.35, 0.25, 0, -1.7, 0, "#a8a29e"],
  ];
  for (let i = 0; i < 6; i++) boxes.push([1.75, 0.65, 0.12, 0, -1.1 + i * 0.65, -0.25 - i * 0.28, step]);
  // Sign: a dark panel on two posts at the street end.
  boxes.push([1.6, 0.08, 0.45, 0, -1.75, 1.35, "#111827"], [1.5, 0.1, 0.08, 0, -1.76, 1.62, "#f8fafc"]); // sign on the end railing, white route band
  return kit(boxes, [[-1.2, -1.7, 2.4], [1.2, -1.7, 2.4]]);
}
/** Elevator variant: a glass cab with a dark roof and a sign. */
function elevatorKit(): THREE.BufferGeometry {
  return kit([[2.2, 2.2, 2.6, 0, 0, 0, "#93c5fd"], [2.4, 2.4, 0.25, 0, 0, 2.6, "#1f2937"], [1.2, 0.08, 0.35, 0, -1.2, 2.0, "#111827"]], [[1.3, -1.3, 2.4]]);
}

const UNIT = new THREE.BoxGeometry(1, 1, 1).toNonIndexed().translate(0, 0, 0.5);
export const STRUCTURE_STEEL = () => new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x9a9a9a });
/** The chunk a bay belongs to. */
export const chunkKey = (lon: number, lat: number) => `${Math.floor(lon / CHUNK)},${Math.floor(lat / CHUNK)}`;
/** Chunk keys to keep built around the camera centre. */
export function wantedChunks(lng: number, lat: number): Set<string> {
  const cx = Math.floor(lng / CHUNK), cy = Math.floor(lat / CHUNK);
  const want = new Set<string>();
  for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) for (let dy = -CHUNK_RADIUS; dy <= CHUNK_RADIUS; dy++) want.add(`${cx + dx},${cy + dy}`);
  return want;
}

/** One merged, vertex-coloured mesh for a chunk of bays. */
export function buildChunk(bays: BayInstance[], f: Frame, material: THREE.Material): THREE.Mesh {
  const src = UNIT.attributes.position as THREE.BufferAttribute, nrm = UNIT.attributes.normal as THREE.BufferAttribute;
  const per = src.count;
  let total = 0;
  const plans = bays.map((b) => { const parts = bayParts(b.top, b.len, b.station); total += parts.length * per; return parts; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), bay = new THREE.Matrix4(), part = new THREE.Matrix4(), full = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1), color = new THREE.Color();
  let o = 0;
  bays.forEach((b, bi) => {
    const [x, y] = toLocal(f, b.lon, b.lat);
    bay.compose(new THREE.Vector3(x, y, b.top), q.setFromAxisAngle(zAxis, bearingToZ(b.bearing)), one);
    for (const pt of plans[bi]) {
      part.makeScale(pt.w, pt.l, Math.max(pt.h, 0.01)).setPosition(pt.x, 0, pt.z);
      full.multiplyMatrices(bay, part);
      nm.getNormalMatrix(full);
      color.set(pt.color);
      for (let k = 0; k < per; k++, o++) {
        v.fromBufferAttribute(src, k).applyMatrix4(full);
        n.fromBufferAttribute(nrm, k).applyMatrix3(nm).normalize();
        pos.set([v.x, v.y, v.z], o * 3); nor.set([n.x, n.y, n.z], o * 3); col.set([color.r, color.g, color.b], o * 3);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  return mesh;
}

/** The two instanced entrance kits (stairs, elevators); out-of-service elevators are tinted gray. */
export function entranceKits() {
  const kitMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x8a8a8a }); // the scene lights are tuned for vehicles; tone the kit down
  const stairs = new THREE.InstancedMesh(stairKit(), kitMat, ENTRANCE_CAP), lifts = new THREE.InstancedMesh(elevatorKit(), kitMat, ENTRANCE_CAP);
  for (const k of [stairs, lifts]) { k.count = 0; k.frustumCulled = false; }
  const white = new THREE.Color(1, 1, 1), gray = new THREE.Color(0.35, 0.35, 0.35);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zAxis = new THREE.Vector3(0, 0, 1);
  /** Entrances near the camera (caller culls to ~300 m); empty hides them. */
  function set(list: EntranceKitInstance[], f: Frame) {
    let a = 0, b = 0;
    for (const e of list) {
      const mesh = e.kind === "elevator" ? lifts : stairs, i = e.kind === "elevator" ? b++ : a++;
      if (i >= ENTRANCE_CAP) continue;
      p.set(...toLocal(f, e.lon, e.lat), 0);
      q.setFromAxisAngle(zAxis, bearingToZ(e.bearing));
      mesh.setMatrixAt(i, m4.compose(p, q, one));
      mesh.setColorAt(i, e.out ? gray : white);
    }
    for (const [mesh, n] of [[stairs, a], [lifts, b]] as const) {
      mesh.count = Math.min(n, ENTRANCE_CAP);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  return { meshes: [stairs, lifts], set };
}
