/** Live vehicles (instanced trains and buses, optional glTF models), elevated structure, station entrances and the x-ray view. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CustomLayerInterface, Map as MaplibreMap } from "maplibre-gl";
import { MercatorCoordinate, LEGACY_LIGHT, sharedRenderer } from "./core";

/** One moving body. `z` is metres above ground; `ghost` draws it translucent through the ground. */
export interface VehicleInstance {
  lon: number;
  lat: number;
  bearing: number;
  z: number;
  color: string;
  kind: VehicleMode;
  ghost: boolean;
}

/** Live-vehicle modes, each with its own swappable glTF slot. */
export type VehicleMode = "subway" | "rail" | "bus";

/**
 * Per-mode glTF slots. Swap a model by publishing a new vehicle-<mode>.glb
 * (`pnpm publish:city-tiles <file>`) or by pointing `url` elsewhere; `length`
 * is the real car length in metres the model is scaled to. Until a model loads
 * (or if it fails) the mode keeps its low-poly box. Sources and CC-BY credits:
 * public/models/LICENSE.md.
 *
 * Trains (subway, LIRR, Metro-North) have no slot: they are always a box in the
 * route colour with the route bullet drawn above it (#366). The train models
 * flashed, stuck after Follow and rode under the el (#319), and cost load time.
 */
export const VEHICLE_MODELS: Partial<Record<VehicleMode, { url: string; length: number }>> = {
  bus: { url: "/api/vehicle-models/bus", length: 12.2 }, // New Flyer XD40, 40 ft
};

/** True when this mode may load a glTF model at all (trains never do). */
export function hasVehicleModel(mode: VehicleMode): boolean {
  return Boolean(VEHICLE_MODELS[mode]);
}

/**
 * The glTF keeps its own livery (the subway car still reads as a generic train).
 * Use it only when 3D buildings are on and eco is off. Otherwise the route-colored
 * box is enough. Pitch is not an input: Top view must not turn the model on.
 */
export function showVehicleModel(eco: boolean, buildings: "flat" | "3d"): boolean {
  return !eco && buildings === "3d";
}

/** `nma.mapOptions` matches mapOptions.ts. That module imports React, which must stay out of this chunk. */
const MAP_OPTIONS_KEY = "nma.mapOptions";

function vehicleModelsWanted(): boolean {
  let eco = false;
  try {
    eco = typeof location !== "undefined" && new URLSearchParams(location.search).get("eco") === "1";
  } catch { /* no location in node tests */ }
  let buildings: "flat" | "3d" = "flat";
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(MAP_OPTIONS_KEY) ?? "{}") as { buildings?: unknown };
    if (raw.buildings === "3d") buildings = "3d";
  } catch { /* private mode or a bad value */ }
  return showVehicleModel(eco, buildings);
}

/** meshopt/quantized glTF stores positions as normalized ints; transforms would clamp them, so expand to float first. */
function dequantize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of ["position", "normal"]) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    if (!a) continue;
    const raw = "isInterleavedBufferAttribute" in a ? a.data.array : a.array;
    if (raw instanceof Float32Array && !a.normalized) continue;
    // Normalized ints map to [-1, 1] (signed) or [0, 1] (unsigned); three 0.134's getX does not do this.
    const k = !a.normalized ? 1 : raw instanceof Int8Array ? 1 / 127 : raw instanceof Int16Array ? 1 / 32767 : raw instanceof Uint8Array ? 1 / 255 : raw instanceof Uint16Array ? 1 / 65535 : 1;
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      out[i * 3] = a.getX(i) * k;
      out[i * 3 + 1] = a.getY(i) * k;
      out[i * 3 + 2] = a.getZ(i) * k;
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  return g;
}

/** glTF (Y up, any axis along the car) to scene space: Z up, length along +Y, base on z = 0, scaled to `length` m. */
function vehicleParts(root: THREE.Object3D, length: number): Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> {
  root.updateMatrixWorld(true);
  const parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> = [];
  const upright = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = dequantize(mesh.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(upright, mesh.matrixWorld));
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) parts.push({ geometry: g, material });
  });
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox!); }
  const size = box.getSize(new THREE.Vector3());
  const turn = size.x > size.y ? new THREE.Matrix4().makeRotationZ(Math.PI / 2) : new THREE.Matrix4();
  const k = length / Math.max(size.x, size.y, 1e-6);
  const c = box.getCenter(new THREE.Vector3());
  const fit = new THREE.Matrix4().makeScale(k, k, k).multiply(turn).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -box.min.z));
  for (const p of parts) p.geometry.applyMatrix4(fit);
  return parts;
}

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
  // The stairwell: dark walls and floor under the opening, so the steps read as going down into the ground, not floating over it.
  const well = "#1f2937";
  boxes.push([0.06, 4.2, 1.9, -1.08, 0.6, -1.9, well], [0.06, 4.2, 1.9, 1.08, 0.6, -1.9, well], [2.2, 0.06, 1.9, 0, 2.7, -1.9, well], [2.2, 4.2, 0.04, 0, 0.6, -1.95, well]);
  // Sign: a dark panel on two posts at the street end.
  boxes.push([1.6, 0.08, 0.45, 0, -1.75, 1.35, "#111827"], [1.5, 0.1, 0.08, 0, -1.76, 1.62, "#f8fafc"]); // sign on the end railing, white route band
  return kit(boxes, [[-1.2, -1.7, 2.4], [1.2, -1.7, 2.4]]);
}
/** Elevator variant: a glass cab with a dark roof and a sign. */
function elevatorKit(): THREE.BufferGeometry {
  return kit([[2.2, 2.2, 2.6, 0, 0, 0, "#93c5fd"], [2.4, 2.4, 0.25, 0, 0, 2.6, "#1f2937"], [1.2, 0.08, 0.35, 0, -1.2, 2.0, "#111827"]], [[1.3, -1.3, 2.4]]);
}

/**
 * X-ray primitive (a station's insides, drawn through a dimmed ground):
 * "area" = flat polygon, "ribbon" = a polyline of `width` m with per-vertex z
 * (stairs slope), "shaft" = a vertical box from pts[0].z up to 0.
 * Higher `order` draws later (on top), so shallower levels read over deeper ones.
 */
export interface XrayPrim {
  kind: "area" | "ribbon" | "shaft";
  pts: Array<[number, number, number]>;
  width: number;
  color: string;
  order: number;
}
export const XRAY_GROUND_RADIUS = 170;

const UNIT = new THREE.BoxGeometry(1, 1, 1).toNonIndexed().translate(0, 0, 0.5);

export const VEHICLES_3D_LAYER = "three-vehicles";
const CAP = 400;

function bodyGeometry(length: number, width: number, height: number): THREE.BufferGeometry {
  // Box with a slightly narrower roof: reads as a car, ~12 triangles.
  const g = new THREE.BoxGeometry(width, length, height, 1, 1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > 0) pos.setX(i, pos.getX(i) * 0.8);
  }
  g.translate(0, 0, height / 2);
  g.computeVertexNormals();
  return g;
}

export function createVehicleLayer() {
  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6 * LEGACY_LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4 * LEGACY_LIGHT);
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);
  const origin = MercatorCoordinate.fromLngLat([-73.97, 40.73], 0);
  const s = origin.meterInMercatorCoordinateUnits();
  const local = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(s, -s, s));

  const make = (geom: THREE.BufferGeometry, ghost: boolean) => {
    // Unlit route color, same idea as the underground boxes. Lambert faces flip light and dark as a car turns, which reads as a flash.
    const mat = ghost
      ? new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthTest: false, depthWrite: false })
      : new THREE.MeshBasicMaterial({});
    const mesh = new THREE.InstancedMesh(geom, mat, CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Create the colour buffer up front so the first compiled shader already reads it.
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(mesh);
    return mesh;
  };
  const boxes: Record<VehicleMode, THREE.InstancedMesh> = {
    subway: make(bodyGeometry(20, 3, 3.8), false),
    rail: make(bodyGeometry(20, 3, 3.8), false),
    bus: make(bodyGeometry(12, 2.6, 3.2), false),
  };
  const ghosts = make(bodyGeometry(20, 3, 3.8), true);
  ghosts.renderOrder = 3;
  /** Loaded glTF parts per mode, one InstancedMesh each; empty until the model arrives. */
  const models: Record<VehicleMode, THREE.InstancedMesh[]> = { subway: [], rail: [], bus: [] };
  let last: VehicleInstance[] = [];
  let modelsRequested = false;
  function loadModels() {
    // onAdd runs again whenever the layer is removed and put back (Follow drops street level, then the chase pitch turns the layer on).
    // A second load used to leave the first meshes in the scene, frozen where the train was, and the two copies strobed while they overlapped.
    if (modelsRequested || !vehicleModelsWanted()) return;
    modelsRequested = true;
    // The meshopt decoder is only needed for these models: keep it out of the shared 3D chunk.
    void import("three/examples/jsm/libs/meshopt_decoder.module.js").then(({ MeshoptDecoder }) => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    for (const [mode, slot] of Object.entries(VEHICLE_MODELS) as Array<[VehicleMode, { url: string; length: number }]>) {
      loader.load(slot.url, (gltf) => {
        if (models[mode].length) return;
        models[mode] = vehicleParts(gltf.scene, slot.length).map(({ geometry, material }) => {
          // The subway emissive map is a noisy sign atlas. It strobes as the camera moves, and the baked word stays "train".
          const lit = material as THREE.MeshStandardMaterial;
          if (lit.emissive) { lit.emissive.set(0); lit.emissiveMap = null; lit.emissiveIntensity = 0; }
          lit.transparent = false;
          lit.depthWrite = true;
          lit.opacity = 1;
          const mesh = new THREE.InstancedMesh(geometry, lit, CAP);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.frustumCulled = false;
          mesh.count = 0;
          scene.add(mesh);
          return mesh;
        });
        boxes[mode].count = 0;
        boxes[mode].visible = false;
        update(last);
      }, undefined, () => { /* keep the box for this mode */ });
    }
    }, () => { /* no decoder: keep the boxes */ });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zAxis = new THREE.Vector3(0, 0, 1), color = new THREE.Color();

  // ---- Elevated structure: lazily merged per-chunk meshes near the camera. ----
  const steelMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x9a9a9a });
  let bayChunks = new Map<string, BayInstance[]>();
  const built = new Map<string, THREE.Mesh>();
  const chunkKey = (lon: number, lat: number) => `${Math.floor(lon / CHUNK)},${Math.floor(lat / CHUNK)}`;
  function buildChunk(bays: BayInstance[]): THREE.Mesh {
    const src = UNIT.attributes.position as THREE.BufferAttribute, nrm = UNIT.attributes.normal as THREE.BufferAttribute;
    const per = src.count;
    let total = 0;
    const plans = bays.map((b) => { const parts = bayParts(b.top, b.len, b.station); total += parts.length * per; return parts; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    const v = new THREE.Vector3(), n = new THREE.Vector3(), bay = new THREE.Matrix4(), part = new THREE.Matrix4(), full = new THREE.Matrix4(), nm = new THREE.Matrix3();
    let o = 0;
    bays.forEach((b, bi) => {
      const mc = MercatorCoordinate.fromLngLat([b.lon, b.lat], 0);
      bay.compose(new THREE.Vector3((mc.x - origin.x) / s, -(mc.y - origin.y) / s, b.top), q.setFromAxisAngle(zAxis, (-b.bearing * Math.PI) / 180), one);
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
    const mesh = new THREE.Mesh(g, steelMat);
    mesh.frustumCulled = false;
    return mesh;
  }
  function syncChunks() {
    if (!map) return;
    const show = map.getZoom() >= STRUCTURE_MINZOOM;
    const c = map.getCenter(), cx = Math.floor(c.lng / CHUNK), cy = Math.floor(c.lat / CHUNK);
    const want = new Set<string>();
    if (show) for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) for (let dy = -CHUNK_RADIUS; dy <= CHUNK_RADIUS; dy++) want.add(`${cx + dx},${cy + dy}`);
    for (const [k, mesh] of built) if (!want.has(k)) { scene.remove(mesh); mesh.geometry.dispose(); built.delete(k); }
    for (const k of want) {
      const bays = bayChunks.get(k);
      if (bays && !built.has(k)) { const mesh = buildChunk(bays); built.set(k, mesh); scene.add(mesh); }
    }
  }
  // ---- Street entrances: two instanced kits; out-of-service elevators are tinted gray. ----
  const kitMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x8a8a8a }); // the scene lights are tuned for vehicles; tone the kit down
  const stairs = new THREE.InstancedMesh(stairKit(), kitMat, ENTRANCE_CAP), lifts = new THREE.InstancedMesh(elevatorKit(), kitMat, ENTRANCE_CAP);
  for (const k of [stairs, lifts]) { k.count = 0; k.frustumCulled = false; scene.add(k); }
  const white = new THREE.Color(1, 1, 1), gray = new THREE.Color(0.35, 0.35, 0.35);
  /** Entrances near the camera (caller culls to ~300 m); empty hides them. */
  function setEntrances(list: EntranceKitInstance[]) {
    let a = 0, b = 0;
    for (const e of list) {
      const mesh = e.kind === "elevator" ? lifts : stairs, i = e.kind === "elevator" ? b++ : a++;
      if (i >= ENTRANCE_CAP) continue;
      const mc = MercatorCoordinate.fromLngLat([e.lon, e.lat], 0);
      p.set((mc.x - origin.x) / s, -(mc.y - origin.y) / s, 0);
      q.setFromAxisAngle(zAxis, (-e.bearing * Math.PI) / 180);
      mesh.setMatrixAt(i, m4.compose(p, q, one));
      mesh.setColorAt(i, e.out ? gray : white);
    }
    for (const [mesh, n] of [[stairs, a], [lifts, b]] as const) {
      mesh.count = Math.min(n, ENTRANCE_CAP);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    map?.triggerRepaint();
  }

  // ---- X-ray station view: one group, rebuilt per station. ----
  let xray: THREE.Group | null = null;
  const toLocal = (lon: number, lat: number, z: number) => {
    const mc = MercatorCoordinate.fromLngLat([lon, lat], 0);
    return new THREE.Vector3((mc.x - origin.x) / s, -(mc.y - origin.y) / s, z);
  };
  const seeThrough = (color: string, opacity: number, order: number) => {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    return (g: THREE.BufferGeometry) => { const m = new THREE.Mesh(g, mat); m.renderOrder = order; m.frustumCulled = false; return m; };
  };
  function ribbon(pts: THREE.Vector3[], width: number): THREE.BufferGeometry {
    const pos: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = new THREE.Vector3(b.x - a.x, b.y - a.y, 0).normalize(), n = new THREE.Vector3(-d.y, d.x, 0).multiplyScalar(width / 2);
      const q1 = a.clone().add(n), q2 = a.clone().sub(n), q3 = b.clone().add(n), q4 = b.clone().sub(n);
      pos.push(q1.x, q1.y, q1.z, q2.x, q2.y, q2.z, q3.x, q3.y, q3.z, q3.x, q3.y, q3.z, q2.x, q2.y, q2.z, q4.x, q4.y, q4.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }
  // ---- Street-level X-ray: a faint ground disc around the walker (a dark one distracted; owner, 2026-10-27). ----
  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    new THREE.MeshBasicMaterial({ color: "#0b1220", transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide }),
  );
  veil.renderOrder = 2;
  veil.frustumCulled = false;
  veil.visible = false;
  scene.add(veil);
  /**
   * Dim the ground within `radius` m of `center` so underground ghosts read through it (null hides).
   * While it is up the layer draws on a cleared depth buffer: the street-level pavement would
   * otherwise hide everything below it. The veil sits just above the 0.5 m block ground.
   */
  function setGroundVeil(center: [number, number] | null, radius = 600) {
    veil.visible = Boolean(center);
    if (center) { veil.position.copy(toLocal(center[0], center[1], 1.0)); veil.scale.set(radius, radius, 1); }
    map?.triggerRepaint();
  }

  /** Show one station's insides around `center` (null clears). */
  function setXray(center: [number, number] | null, prims: XrayPrim[] = []) {
    if (xray) { scene.remove(xray); for (const o of xray.children as THREE.Mesh[]) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } xray = null; }
    if (center) {
      xray = new THREE.Group();
      const c = toLocal(center[0], center[1], 0.3);
      xray.add(seeThrough("#0b1220", 0.6, 1)(new THREE.CircleGeometry(XRAY_GROUND_RADIUS, 48).translate(c.x, c.y, c.z)));
      for (const p of prims) {
        const v = p.pts.map(([lon, lat, z]) => toLocal(lon, lat, z));
        const mk = seeThrough(p.color, p.kind === "area" ? 0.75 : 0.95, 2 + p.order);
        if (p.kind === "area" && v.length >= 3) {
          const g = new THREE.ShapeGeometry(new THREE.Shape(v.map((q) => new THREE.Vector2(q.x, q.y))));
          xray.add(mk(g.translate(0, 0, v[0].z)));
          xray.add(mk(ribbon([...v, v[0]], 0.4))); // crisp edge
        } else if (p.kind === "shaft") {
          const h = Math.max(-v[0].z, 1);
          xray.add(mk(new THREE.BoxGeometry(p.width, p.width, h).translate(v[0].x, v[0].y, v[0].z + h / 2)));
        } else if (v.length >= 2) xray.add(mk(ribbon(v, p.width)));
      }
      scene.add(xray);
    }
    map?.triggerRepaint();
  }

  /** Replace the viaduct bays (static; call once per network load). */
  function setStructure(bays: BayInstance[]) {
    bayChunks = new Map();
    for (const b of bays) { const k = chunkKey(b.lon, b.lat); const a = bayChunks.get(k); if (a) a.push(b); else bayChunks.set(k, [b]); }
    for (const mesh of built.values()) { scene.remove(mesh); mesh.geometry.dispose(); }
    built.clear();
    syncChunks();
    map?.triggerRepaint();
  }

  const layer: CustomLayerInterface = {
    id: VEHICLES_3D_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      m.on("moveend", syncChunks);
      syncChunks();
      loadModels();
    },
    onRemove() {
      map?.off("moveend", syncChunks);
      renderer = null; // shared with the other three.js layers: never dispose it here
    },
    render(_gl, args) {
      if (!renderer) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local);
      renderer.resetState();
      if (veil.visible) renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.resetState();
    },
  };

  /** Metres above the given z so a body is not coplanar with the pavement or the viaduct deck (that pair strobes). */
  const BODY_CLEAR_M = 0.4;

  /** Push the tweened vehicles (already culled and capped by the caller). */
  function update(vehicles: VehicleInstance[]) {
    last = vehicles;
    loadModels();
    const detailed = vehicleModelsWanted();
    const n: Record<VehicleMode, number> = { subway: 0, rail: 0, bus: 0 };
    let g = 0;
    for (const v of vehicles) {
      const mc = MercatorCoordinate.fromLngLat([v.lon, v.lat], 0);
      // Ghosts stay at the caller's depth. Solid bodies lift just clear of the surface they sit on.
      p.set((mc.x - origin.x) / s, -(mc.y - origin.y) / s, v.ghost ? v.z : v.z + BODY_CLEAR_M);
      q.setFromAxisAngle(zAxis, (-v.bearing * Math.PI) / 180);
      m4.compose(p, q, one);
      if (v.ghost) {
        if (g >= CAP) continue;
        ghosts.setMatrixAt(g, m4);
        ghosts.setColorAt(g++, color.set(v.color));
        continue;
      }
      const i = n[v.kind]++;
      if (i >= CAP) continue;
      const parts = detailed && hasVehicleModel(v.kind) ? models[v.kind] : [];
      // A loaded model keeps its own livery; the box stand-in carries the route color.
      if (parts.length) for (const part of parts) part.setMatrixAt(i, m4);
      else { boxes[v.kind].setMatrixAt(i, m4); boxes[v.kind].setColorAt(i, color.set(v.color)); }
    }
    for (const mode of Object.keys(n) as VehicleMode[]) {
      const count = Math.min(n[mode], CAP);
      const useModel = detailed && hasVehicleModel(mode) && models[mode].length > 0;
      const active = useModel ? models[mode] : [boxes[mode]];
      const inactive = useModel ? [boxes[mode]] : models[mode];
      for (const mesh of active) {
        mesh.visible = true;
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      for (const mesh of inactive) {
        mesh.visible = false;
        mesh.count = 0;
      }
    }
    ghosts.count = Math.min(g, CAP);
    ghosts.instanceMatrix.needsUpdate = true;
    if (ghosts.instanceColor) ghosts.instanceColor.needsUpdate = true;
    map?.triggerRepaint();
  }
  return { layer, update, setStructure, setEntrances, setXray, setGroundVeil };
}

/* ------------------------------------------------------------------------ */
/* NYC fire hydrants                                                         */
/* ------------------------------------------------------------------------ */
