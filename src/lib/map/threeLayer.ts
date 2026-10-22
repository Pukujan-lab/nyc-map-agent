/**
 * The ONLY file that imports three.js. Every three.js custom layer lives here
 * (3D vehicles and elevated structure, hydrants, corner street-name signs, storefront signboards) and they all
 * draw through ONE WebGLRenderer per MapLibre GL context (sharedRenderer):
 * several renderers on one context each kept their own GL state cache, and
 * with all three layers on at street level the headless SwiftShader context
 * was lost (#98). Layers only repaint when their content changes.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { cornerOffset, crossingsNear, dirOf, streetBearingAt, toLocal, type NamedStreet } from "./signPlacement";
import { eyeOrCenter, kioskSources, setPickTargets, type PickTarget } from "./streetPick";
import { LANDMARKS } from "./landmarks";
import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MaplibreMap } from "maplibre-gl";
// Default import: also loads under Node (CJS) for scripts/make-landmarks.ts.
const { MercatorCoordinate } = maplibregl;
type MapLibreMap = MaplibreMap;


const renderers = new WeakMap<WebGLRenderingContext | WebGL2RenderingContext, THREE.WebGLRenderer>();

/** One three.js renderer per MapLibre GL context, shared by every custom layer. */
export function sharedRenderer(map: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): THREE.WebGLRenderer {
  let r = renderers.get(gl);
  if (!r) {
    r = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    r.autoClear = false;
    r.outputEncoding = THREE.sRGBEncoding;
    renderers.set(gl, r);
  }
  return r;
}


// ---- 3D vehicles, structures, hydrants ----

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
 */
export const VEHICLE_MODELS: Record<VehicleMode, { url: string; length: number }> = {
  subway: { url: "/api/vehicle-models/subway", length: 15.7 }, // R142, 51 ft
  rail: { url: "/api/vehicle-models/rail", length: 21.2 }, // P32AC-DM, 69 ft
  bus: { url: "/api/vehicle-models/bus", length: 12.2 }, // New Flyer XD40, 40 ft
};

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
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);
  const origin = MercatorCoordinate.fromLngLat([-73.97, 40.73], 0);
  const s = origin.meterInMercatorCoordinateUnits();
  const local = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(s, -s, s));

  const make = (geom: THREE.BufferGeometry, ghost: boolean) => {
    // Ghosts glow: unlit, full route colour, drawn through the ground and buildings.
    const mat = ghost
      ? new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthTest: false, depthWrite: false })
      : new THREE.MeshLambertMaterial({});
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
  function loadModels() {
    // The meshopt decoder is only needed for these models: keep it out of the shared 3D chunk.
    void import("three/examples/jsm/libs/meshopt_decoder.module.js").then(({ MeshoptDecoder }) => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    for (const mode of Object.keys(VEHICLE_MODELS) as VehicleMode[]) {
      loader.load(VEHICLE_MODELS[mode].url, (gltf) => {
        models[mode] = vehicleParts(gltf.scene, VEHICLE_MODELS[mode].length).map(({ geometry, material }) => {
          const mesh = new THREE.InstancedMesh(geometry, material, CAP);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.frustumCulled = false;
          mesh.count = 0;
          scene.add(mesh);
          return mesh;
        });
        boxes[mode].count = 0;
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
  // ---- Street-level X-ray: a semi-transparent ground disc around the walker. ----
  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    new THREE.MeshBasicMaterial({ color: "#0b1220", transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
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
    },
  };

  /** Push the tweened vehicles (already culled and capped by the caller). */
  function update(vehicles: VehicleInstance[]) {
    last = vehicles;
    const n: Record<VehicleMode, number> = { subway: 0, rail: 0, bus: 0 };
    let g = 0;
    for (const v of vehicles) {
      const mc = MercatorCoordinate.fromLngLat([v.lon, v.lat], 0);
      p.set((mc.x - origin.x) / s, -(mc.y - origin.y) / s, v.z);
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
      const parts = models[v.kind];
      // A loaded model keeps its own livery; the box stand-in carries the route colour.
      if (parts.length) for (const part of parts) part.setMatrixAt(i, m4);
      else { boxes[v.kind].setMatrixAt(i, m4); boxes[v.kind].setColorAt(i, color.set(v.color)); }
    }
    for (const mode of Object.keys(n) as VehicleMode[]) {
      const count = Math.min(n[mode], CAP);
      for (const mesh of models[mode].length ? models[mode] : [boxes[mode]]) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

export const HYDRANTS_3D_LAYER = "city3d-hydrants";
const HYDRANT_CAP = 400;
const HYDRANT_RADIUS_M = 350;
const HYDRANT_MIN_ZOOM = 16;

/** One hydrant point: where it stands and which way its pumper nozzle faces (degrees). */
export interface HydrantInstance {
  lon: number;
  lat: number;
  facing: number;
}

/** Lathe around the vertical (z) axis from a [radius, height] profile in metres. */
function lathe(profile: Array<[number, number]>, segments = 14): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), segments);
  g.rotateX(Math.PI / 2); // lathe is y-up; the map scene is z-up
  g.computeVertexNormals();
  return g;
}

/**
 * The NYC hydrant silhouette (the Kennedy / Mueller "Guardian" on most corners):
 * a wide base flange, a stout red barrel, a silver domed bonnet with a
 * pentagon operating nut, two side hose nozzles and a bigger front pumper
 * nozzle, all ~0.8 m tall. Procedural, a few hundred triangles.
 */
function hydrantParts() {
  const body = lathe([
    [0.001, 0], [0.17, 0], [0.17, 0.035], [0.13, 0.05], [0.115, 0.08],
    [0.105, 0.5], [0.125, 0.52], [0.125, 0.58], [0.001, 0.58],
  ]);
  const bonnet = lathe([
    [0.001, 0.58], [0.12, 0.58], [0.115, 0.63], [0.085, 0.69], [0.04, 0.715],
    [0.035, 0.715], [0.035, 0.78], [0.001, 0.78],
  ], 10);
  // Nozzle along +x from the barrel axis, unit length scaled per instance.
  const nozzle = new THREE.CylinderGeometry(1, 1, 1, 10);
  nozzle.rotateZ(Math.PI / 2);
  nozzle.translate(0.5, 0, 0);
  return { body, bonnet, nozzle };
}

/** Deterministic 0..360 from a position, so a hydrant keeps its facing between frames. */
export function hydrantFacing(lon: number, lat: number): number {
  const h = Math.sin(lon * 12_989.8 + lat * 78_233.1) * 43_758.5453;
  return Math.round((h - Math.floor(h)) * 4) * 90;
}

/** Hydrants near the map centre from the city tiles' `props` layer (kind = hydrant). */
export function nearbyHydrants(map: MaplibreMap): HydrantInstance[] {
  if (!map.getSource("city3d") || map.getZoom() < HYDRANT_MIN_ZOOM) return [];
  const { lng, lat } = map.getCenter();
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const seen = new Map<string, HydrantInstance & { d: number }>();
  for (const f of map.querySourceFeatures("city3d", { sourceLayer: "props", filter: ["==", ["get", "kind"], "hydrant"] })) {
    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : undefined;
    if (!ring?.length) continue;
    let x = 0, y = 0;
    const n = ring.length - 1 || 1;
    for (let i = 0; i < n; i++) {
      x += ring[i][0];
      y += ring[i][1];
    }
    x /= n;
    y /= n;
    const d = Math.hypot((x - lng) * kx, (y - lat) * 111_320);
    if (d > HYDRANT_RADIUS_M) continue;
    const key = `${x.toFixed(6)},${y.toFixed(6)}`;
    if (!seen.has(key)) seen.set(key, { lon: x, lat: y, facing: hydrantFacing(x, y), d });
  }
  return [...seen.values()].sort((a, b) => a.d - b.d).slice(0, HYDRANT_CAP);
}

/**
 * Instanced NYC hydrants, drawn in MapLibre's canvas and depth buffer like the
 * vehicles. Replaces the red hexagonal stubs the `city3d-props` extrusion draws
 * (that layer gets a filter dropping kind = hydrant once this one is added).
 */
export function createHydrantLayer(): CustomLayerInterface {
  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6b6b, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);
  const origin = MercatorCoordinate.fromLngLat([-73.97, 40.73], 0);
  const s = origin.meterInMercatorCoordinateUnits();
  const local = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(s, -s, s));

  const parts = hydrantParts();
  const red = new THREE.MeshLambertMaterial({ color: 0xc8352b });
  const silver = new THREE.MeshLambertMaterial({ color: 0xc9ccd1 });
  const make = (geom: THREE.BufferGeometry, mat: THREE.Material, cap: number) => {
    const mesh = new THREE.InstancedMesh(geom, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  };
  const bodies = make(parts.body, red, HYDRANT_CAP);
  const bonnets = make(parts.bonnet, silver, HYDRANT_CAP);
  const nozzles = make(parts.nozzle, silver, HYDRANT_CAP * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const zAxis = new THREE.Vector3(0, 0, 1), sc = new THREE.Vector3(), off = new THREE.Vector3();
  // [angle from facing, height, radius, length]: front pumper, two side hose outlets.
  const NOZZLES: Array<[number, number, number, number]> = [[0, 0.4, 0.06, 0.2], [90, 0.44, 0.04, 0.17], [-90, 0.44, 0.04, 0.17]];

  const refresh = () => {
    if (!map) return;
    const list = nearbyHydrants(map);
    let k = 0;
    list.forEach((h, i) => {
      const mc = MercatorCoordinate.fromLngLat([h.lon, h.lat], 0);
      p.set((mc.x - origin.x) / s, -(mc.y - origin.y) / s, 0);
      q.setFromAxisAngle(zAxis, (-h.facing * Math.PI) / 180);
      m4.compose(p, q, one);
      bodies.setMatrixAt(i, m4);
      bonnets.setMatrixAt(i, m4);
      for (const [a, z, r, len] of NOZZLES) {
        q.setFromAxisAngle(zAxis, ((-h.facing + a) * Math.PI) / 180);
        off.set(0, 0, z).add(p);
        nozzles.setMatrixAt(k++, m4.compose(off, q, sc.set(len, r, r)));
      }
    });
    bodies.count = bonnets.count = list.length;
    nozzles.count = k;
    for (const mesh of [bodies, bonnets, nozzles]) mesh.instanceMatrix.needsUpdate = true;
    map.triggerRepaint();
  };
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId === "city3d" && e.isSourceLoaded) refresh();
  };

  return {
    id: HYDRANTS_3D_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      m.on("moveend", refresh);
      m.on("sourcedata", onData);
      refresh();
    },
    onRemove(m) {
      m.off("moveend", refresh);
      m.off("sourcedata", onData);
      // The renderer is shared by every three.js layer; never dispose it here.
      renderer = null;
    },
    render(_gl, args) {
      if (!renderer || !map || map.getZoom() < HYDRANT_MIN_ZOOM || bodies.count === 0) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}

// ---- Corner street-name signs ----

/**
 * Corner street-name signs at street level. Intersections and street names are
 * baked into the city tiles as the `signs` layer (scripts/build-sign-tiles.ts,
 * from DCP LION); this custom layer draws the CC0 "Street Name Sign" GLB
 * (public/models/LICENSE.md) at the nearest ones in MapLibre's own canvas and
 * depth buffer, with the blades overlaid by canvas-text decals.
 * Only zoom >= SIGNS_MIN_ZOOM and within SIGNS_RADIUS_M of the camera, at most SIGNS_MAX.
 */
export const STREET_SIGNS_LAYER = "city3d-signs";
export const SIGNS_MIN_ZOOM = 17;
const SIGNS_RADIUS_M = 220;
const SIGNS_MAX = 40; // two names each: 80 of the atlas's 84 slots
const POLE_H = 3.7; // NYC sign poles are ~3.5-4 m
// Real blades are ~0.75 x 0.15 m, but at eye level and 30 m away that is a few
// pixels of text: blades are drawn ~1.6x larger so names stay readable.
const BLADE_W = 1.25;
const BLADE_H = 0.26;
const BLADE_T = 0.03;
const BLADE_Z = [POLE_H - 0.42, POLE_H - 0.12]; // street A lower, street B on top, crossed
/** Road-surface name: metres across the street, along it, and back from the crossing. */
const ROAD_W = 7;
const ROAD_H = 3.5;
const ROAD_BACK_M = 14;
// Atlas: 2048 x 2048, 4 columns x 21 rows of 512 x 96 blade faces.
const ATLAS = 2048;
const SLOT_W = 512;
const SLOT_H = 96;
const COLS = ATLAS / SLOT_W;

interface Sign {
  key: string;
  lng: number;
  lat: number;
  a: string;
  b: string;
  ba: number;
  bb: number;
}

/** The walker's eye, not the map centre (see eyeOrCenter). */
const eyeLngLat = eyeOrCenter;

/** Pedestrian-scale road classes whose crossings get a corner sign. */
const SIGN_CLASSES = new Set(["minor", "tertiary", "secondary", "primary", "trunk", "living_street", "residential"]);

/**
 * Corner signs around the eye (not the map centre, which floats down the look
 * ray at eye level), from the crossings of the basemap's named street
 * centrelines (OSM, the same lines the street-view header reads).
 */
function nearbySigns(map: MapLibreMap, eye: { lng: number; lat: number }): Sign[] {
  if (!map.getSource("openmaptiles")) return [];
  const lines: NamedStreet[] = [];
  for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation_name" })) {
    const p = f.properties ?? {};
    if (!SIGN_CLASSES.has(String(p.class)) || p.brunnel === "tunnel" || p.brunnel === "bridge") continue;
    const name = String(p["name:en"] ?? p.name ?? "");
    if (!name) continue;
    const g = f.geometry;
    if (g.type === "LineString") lines.push({ name, coords: g.coordinates as Array<[number, number]> });
    else if (g.type === "MultiLineString") for (const c of g.coordinates) lines.push({ name, coords: c as Array<[number, number]> });
  }
  return crossingsNear(lines, eye, SIGNS_RADIUS_M, SIGNS_MAX).map((c) => ({ ...c, key: `${c.lng.toFixed(5)},${c.lat.toFixed(5)}` }));
}

/** Blade face: white on NYC street-sign green, abbreviated as the real signs are ("Grand St"). */
function drawBlade(g: CanvasRenderingContext2D, slot: number, name: string) {
  const x = (slot % COLS) * SLOT_W;
  const y = Math.floor(slot / COLS) * SLOT_H;
  g.fillStyle = "#0b6b3a";
  g.fillRect(x, y, SLOT_W, SLOT_H);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 4;
  g.strokeRect(x + 6, y + 6, SLOT_W - 12, SLOT_H - 12);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 60;
  do g.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(name).width > SLOT_W - 40 && (size -= 3) > 18);
  g.fillText(name, x + SLOT_W / 2, y + SLOT_H / 2 + 3);
}

/**
 * Street name painted on the asphalt before the crossing, white on clear, in
 * the half-size road atlas. Seen from 1.7 m up, the plane (stretched along the
 * road) foreshortens the letters back to normal proportions, like "STOP".
 */
function drawRoad(g: CanvasRenderingContext2D, slot: number, name: string) {
  const w = SLOT_W / 2;
  const h = SLOT_H / 2;
  const x = (slot % COLS) * w;
  const y = Math.floor(slot / COLS) * h;
  g.fillStyle = "rgba(244,241,232,0.95)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 34;
  do g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(name).width > w - 12 && (size -= 2) > 10);
  g.fillText(name, x + w / 2, y + h / 2 + 2, w - 8);
}

/**
 * Instanced plane material that samples its own atlas slot (blade faces, or
 * road letters on clear). Road letters are an alpha cut-out, not blended:
 * blending inside MapLibre's shared context dropped them entirely.
 */
function slotMaterial(atlas: THREE.Texture, road: boolean): THREE.MeshBasicMaterial {
  const m = road
    ? new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })
    : new THREE.MeshBasicMaterial({ map: atlas, color: 0xe6e6e6 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 slot;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>\nvUv = vec2((slot.x + ${road ? "1.0 - uv.x" : "uv.x"}) / ${COLS.toFixed(1)}, 1.0 - (slot.y + 1.0 - uv.y) * ${(SLOT_H / ATLAS).toFixed(6)});`,
      );
  };
  // Road letters flip u: the layer matrix mirrors handedness, which read them backwards.
  m.customProgramCacheKey = () => (road ? "slot-road" : "slot-face");
  return m;
}

export function createStreetSignsLayer(): CustomLayerInterface {
  let map: MapLibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const g = canvas.getContext("2d")!;
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.encoding = THREE.sRGBEncoding;
  atlas.anisotropy = 8;
  // Road letters: same slot grid at half resolution, white on clear.
  const roadCanvas = document.createElement("canvas");
  roadCanvas.width = ATLAS / 2;
  roadCanvas.height = ATLAS / 2;
  const rg = roadCanvas.getContext("2d")!;
  const roadAtlas = new THREE.CanvasTexture(roadCanvas);
  roadAtlas.encoding = THREE.sRGBEncoding;
  roadAtlas.anisotropy = 8;

  // One draw call per part, for every sign in view.
  const poleGeo = new THREE.CylinderGeometry(0.045, 0.055, POLE_H, 8).rotateX(Math.PI / 2).translate(0, 0, POLE_H / 2);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2c3530, metalness: 0.5, roughness: 0.55 }), SIGNS_MAX);
  const bladeGeo = new THREE.BoxGeometry(1, 1, 1);
  const blades = new THREE.InstancedMesh(bladeGeo, new THREE.MeshStandardMaterial({ color: 0x0b6b3a, roughness: 0.6 }), SIGNS_MAX * 2);
  const faceGeo = new THREE.PlaneGeometry(1, 1);
  const faceSlot = new THREE.InstancedBufferAttribute(new Float32Array(SIGNS_MAX * 4 * 2), 2);
  faceGeo.setAttribute("slot", faceSlot);
  const faces = new THREE.InstancedMesh(faceGeo, slotMaterial(atlas, false), SIGNS_MAX * 4);
  const roadGeo = new THREE.PlaneGeometry(1, 1);
  const roadSlot = new THREE.InstancedBufferAttribute(new Float32Array(SIGNS_MAX * 4 * 2), 2);
  roadGeo.setAttribute("slot", roadSlot);
  const roads = new THREE.InstancedMesh(roadGeo, slotMaterial(roadAtlas, true), SIGNS_MAX * 4);
  for (const m of [poles, blades, faces, roads]) {
    m.frustumCulled = false;
    m.count = 0;
    // Sun shadows (when on) fall from the pole and blades.
    m.castShadow = m !== roads && m !== faces;
    scene.add(m);
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);

  let origin = new MercatorCoordinate(0, 0, 0);
  let meters = 1;
  let shown = "";
  let lastEye = { lng: 0, lat: 0 };
  let lastCheck = 0;
  let dirty = true;

  const refresh = () => {
    if (map.getZoom() < SIGNS_MIN_ZOOM) {
      if (poles.count) {
        for (const m of [poles, blades, faces, roads]) m.count = 0;
        shown = "";
        map.triggerRepaint();
      }
      return;
    }
    const eye = eyeLngLat(map);
    const want = nearbySigns(map, eye);
    const key = want.map((s) => s.key).join("|");
    if (key === shown && !dirty) return;
    shown = key;
    dirty = false;
    lastEye = eye;
    origin = MercatorCoordinate.fromLngLat(eye, 0);
    meters = origin.meterInMercatorCoordinateUnits();
    g.clearRect(0, 0, ATLAS, ATLAS);
    rg.clearRect(0, 0, ATLAS / 2, ATLAS / 2);
    const m = new THREE.Matrix4();
    const Z = new THREE.Vector3(0, 0, 1);
    let nb = 0;
    let nf = 0;
    let nr = 0;
    want.forEach((s, i) => {
      const slots = [2 * i, 2 * i + 1];
      drawBlade(g, slots[0], s.a);
      drawBlade(g, slots[1], s.b);
      drawRoad(rg, slots[0], s.a);
      drawRoad(rg, slots[1], s.b);
      const [cx, cy] = toLocal(s.lng, s.lat, eye);
      const [ox, oy] = cornerOffset(s.ba, s.bb);
      const pole = new THREE.Vector3(cx + ox, cy + oy, 0);
      m.makeTranslation(pole.x, pole.y, 0);
      poles.setMatrixAt(i, m);
      [s.ba, s.bb].forEach((brg, k) => {
        const [ux, uy] = dirOf(brg);
        const u = new THREE.Vector3(ux, uy, 0); // along the street: the blade runs parallel to it
        const n = new THREE.Vector3(uy, -ux, 0); // blade face normal
        const z = BLADE_Z[k];
        m.makeBasis(u.clone().multiplyScalar(BLADE_W), n.clone().multiplyScalar(BLADE_T), Z.clone().multiplyScalar(BLADE_H)).setPosition(pole.x, pole.y, z);
        blades.setMatrixAt(nb++, m);
        const slot = slots[k];
        for (const side of [1, -1]) {
          const nn = n.clone().multiplyScalar(side);
          const right = new THREE.Vector3().crossVectors(Z, nn); // reads left-to-right from that side
          m.makeBasis(right.multiplyScalar(BLADE_W * 0.98), Z.clone().multiplyScalar(BLADE_H * 0.96), nn)
            .setPosition(pole.x + nn.x * (BLADE_T / 2 + 0.004), pole.y + nn.y * (BLADE_T / 2 + 0.004), z);
          faces.setMatrixAt(nf, m);
          faceSlot.setXY(nf++, slot % COLS, Math.floor(slot / COLS));
          // Name painted on the asphalt on each approach, reading toward the crossing.
          const look = new THREE.Vector3(-side * ux, -side * uy, 0);
          const r = new THREE.Vector3(look.y, -look.x, 0);
          m.makeBasis(r.multiplyScalar(ROAD_W), look.multiplyScalar(ROAD_H), Z)
            .setPosition(cx + side * ux * ROAD_BACK_M, cy + side * uy * ROAD_BACK_M, 0.05);
          roads.setMatrixAt(nr, m);
          roadSlot.setXY(nr++, slot % COLS, Math.floor(slot / COLS));
        }
      });
    });
    poles.count = want.length;
    blades.count = nb;
    faces.count = nf;
    roads.count = nr;
    for (const x of [poles, blades, faces, roads]) x.instanceMatrix.needsUpdate = true;
    faceSlot.needsUpdate = true;
    roadSlot.needsUpdate = true;
    atlas.needsUpdate = true;
    roadAtlas.needsUpdate = true;
    map.triggerRepaint();
  };
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId === "openmaptiles" && e.isSourceLoaded) {
      dirty = true;
      refresh();
    }
  };

  return {
    id: STREET_SIGNS_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      m.on("moveend", refresh);
      m.on("sourcedata", onData);
      refresh();
    },
    onRemove(m) {
      m.off("moveend", refresh);
      m.off("sourcedata", onData);
      for (const x of [poles, blades, faces, roads]) {
        x.geometry.dispose();
        (x.material as THREE.Material).dispose();
      }
      atlas.dispose();
      roadAtlas.dispose();
    },
    render(_gl, args: CustomRenderMethodInput) {
      // Walking moves the eye every frame without a moveend; re-pick every
      // ~0.4 s once it has gone 15 m, so the corner you stand at is always built.
      const now = performance.now();
      if (now - lastCheck > 400) {
        lastCheck = now;
        const e = eyeLngLat(map);
        const [dx, dy] = toLocal(e.lng, e.lat, lastEye);
        if (Math.hypot(dx, dy) > 15) {
          dirty = true;
          refresh();
        }
      }
      if (map.getZoom() < SIGNS_MIN_ZOOM || !poles.count) return;
      const s = meters;
      const l = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z ?? 0).scale(new THREE.Vector3(s, -s, s));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}

// ---- Street furniture: bus stop poles and restroom kiosks ----

export const FURNITURE_LAYER = "city3d-furniture";
const FURN_MIN_ZOOM = 17;
const BUS_MAX = 24;
const BUS_RADIUS_M = 260;
const BUS_POLE_H = 3.0;
const BUS_PLATE = { w: 0.5, h: 0.78, t: 0.03, z: 2.55 };
const KIOSK_MAX = 24;
const KIOSK_RADIUS_M = 220;
const KIOSK = { w: 1.3, h: 2.7, panel: 1.1 };
const BUS_COLS = 8;
const BUS_ROWS = 3; // 2048 x 1536: 24 portrait slots of 256 x 512
const API = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/$/, "");

interface BusStop { id: string; name: string; lat: number; lon: number; dir: string; routes: string[] }

/** Instanced plane material sampling cell (slot.x, slot.y) of a cols x rows atlas. */
function gridMaterial(tex: THREE.Texture, cols: number, rows: number, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: tex, ...opts });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 slot;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>\nvUv = vec2((slot.x + uv.x) / ${cols.toFixed(1)}, 1.0 - (slot.y + 1.0 - uv.y) / ${rows.toFixed(1)});`);
  };
  m.customProgramCacheKey = () => `grid-${cols}x${rows}`;
  return m;
}

/** MTA bus stop flag: white on MTA blue, "BUS" pictogram line, then each route in a white tile. */
function drawBusPlate(g: CanvasRenderingContext2D, slot: number, routes: string[]) {
  const W = 256, H = 512;
  const x = (slot % BUS_COLS) * W, y = Math.floor(slot / BUS_COLS) * H;
  g.fillStyle = "#0039a6";
  g.fillRect(x, y, W, H);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '700 54px "Helvetica Neue", Arial, sans-serif';
  g.fillText("BUS", x + W / 2, y + 48);
  g.fillRect(x + 22, y + 86, W - 44, 4);
  const shown = routes.slice(0, 6);
  const rowH = Math.min(64, (H - 120) / Math.max(1, shown.length));
  shown.forEach((r, i) => {
    const cy = y + 112 + i * rowH + rowH / 2;
    g.fillStyle = "#ffffff";
    g.fillRect(x + 26, cy - rowH / 2 + 5, W - 52, rowH - 10);
    g.fillStyle = "#0039a6";
    let size = Math.min(46, rowH - 16);
    do g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`;
    while (g.measureText(r).width > W - 70 && (size -= 2) > 14);
    g.fillText(r, x + W / 2, cy + 2);
  });
  if (routes.length > shown.length) {
    g.fillStyle = "#ffffff";
    g.font = '600 28px "Helvetica Neue", Arial, sans-serif';
    g.fillText(`+${routes.length - shown.length} more`, x + W / 2, y + H - 22);
  }
}

/**
 * Restroom kiosk panel in the Kresilo palette, built for legibility: ink on
 * ivory, a large pictogram, the access rule in words, chartreuse when anyone
 * may use it, and the wheelchair symbol when the place says it is accessible.
 * Four variants: [anyone, customers] x [plain, wheelchair].
 */
function drawKioskPanels(g: CanvasRenderingContext2D) {
  const S = 512;
  ["anyone", "customers"].forEach((access, ai) => {
    [false, true].forEach((wc, wi) => {
      const x = (ai * 2 + wi) * S;
      g.fillStyle = "#f6f3ea";
      g.fillRect(x, 0, S, S);
      g.fillStyle = "#16161a";
      g.fillRect(x + 10, 10, S - 20, 14);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = '800 150px "Helvetica Neue", Arial, sans-serif';
      g.fillText("WC", x + S / 2, 150);
      g.font = '600 46px "Helvetica Neue", Arial, sans-serif';
      g.fillText("Restroom", x + S / 2, 262);
      const band = access === "anyone";
      g.fillStyle = band ? "#d4f53c" : "#16161a";
      g.fillRect(x + 22, 316, S - 44, 108);
      g.fillStyle = band ? "#16161a" : "#f6f3ea";
      g.font = `800 ${band ? 70 : 56}px "Helvetica Neue", Arial, sans-serif`;
      g.fillText(band ? "Anyone" : "Customers only", x + S / 2, 372, S - 64);
      if (wc) {
        g.fillStyle = "#16161a";
        g.font = '700 64px "Helvetica Neue", Arial, sans-serif';
        g.fillText("\u267F accessible", x + S / 2, 470, S - 60);
      }
    });
  });
}

function wheelchairOf(p: Record<string, unknown>): boolean {
  if (p.wheelchair === true || p.wheelchair === "true") return true;
  const a = typeof p.accessibility === "string" ? p.accessibility : "";
  return /accessible/i.test(a) && !/not|in-?accessible/i.test(a);
}


/**
 * Bus stop pole signs (MTA blue flag with the routes serving the stop, the
 * flag edge-on to the curb so it reads along the sidewalk and to an arriving
 * bus) and restroom kiosks (public restrooms "Anyone", shops and cafés
 * "Customers only"), instanced: 6 draw calls for everything in view.
 */
export function createFurnitureLayer(): CustomLayerInterface {
  let map: MapLibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const busCanvas = document.createElement("canvas");
  busCanvas.width = 256 * BUS_COLS;
  busCanvas.height = 512 * BUS_ROWS;
  const bg = busCanvas.getContext("2d")!;
  const busTex = new THREE.CanvasTexture(busCanvas);
  busTex.encoding = THREE.sRGBEncoding;
  busTex.anisotropy = 8;
  const kioskCanvas = document.createElement("canvas");
  kioskCanvas.width = 2048;
  kioskCanvas.height = 512;
  drawKioskPanels(kioskCanvas.getContext("2d")!);
  const kioskTex = new THREE.CanvasTexture(kioskCanvas);
  kioskTex.encoding = THREE.sRGBEncoding;
  kioskTex.anisotropy = 8;

  const busPoles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.04, 0.05, BUS_POLE_H, 8).rotateX(Math.PI / 2).translate(0, 0, BUS_POLE_H / 2),
    new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.6, roughness: 0.45 }),
    BUS_MAX,
  );
  const busPlates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x0039a6, roughness: 0.5 }), BUS_MAX);
  const busFaceGeo = new THREE.PlaneGeometry(1, 1);
  const busSlot = new THREE.InstancedBufferAttribute(new Float32Array(BUS_MAX * 2 * 2), 2);
  busFaceGeo.setAttribute("slot", busSlot);
  const busFaces = new THREE.InstancedMesh(busFaceGeo, gridMaterial(busTex, BUS_COLS, BUS_ROWS), BUS_MAX * 2);
  const kioskBodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(KIOSK.w, KIOSK.w, KIOSK.h).translate(0, 0, KIOSK.h / 2),
    new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.7 }),
    KIOSK_MAX,
  );
  const kioskFaceGeo = new THREE.PlaneGeometry(1, 1);
  const kioskSlot = new THREE.InstancedBufferAttribute(new Float32Array(KIOSK_MAX * 4 * 2), 2);
  kioskFaceGeo.setAttribute("slot", kioskSlot);
  const kioskFaces = new THREE.InstancedMesh(kioskFaceGeo, gridMaterial(kioskTex, 4, 1), KIOSK_MAX * 4);
  const all = [busPoles, busPlates, busFaces, kioskBodies, kioskFaces];
  for (const m of all) {
    m.frustumCulled = false;
    m.count = 0;
    m.castShadow = m !== busFaces && m !== kioskFaces;
    scene.add(m);
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);

  let origin = new MercatorCoordinate(0, 0, 0);
  let meters = 1;
  let eyeAt = { lng: 0, lat: 0 };
  let stops: BusStop[] = [];
  let fetchedAt: { lng: number; lat: number } | null = null;
  let lastCheck = 0;
  let shown = "";

  const loadStops = (eye: { lng: number; lat: number }) => {
    if (fetchedAt && Math.hypot(...toLocal(eye.lng, eye.lat, fetchedAt)) < 120) return;
    fetchedAt = eye;
    const q = new URLSearchParams({ lat: eye.lat.toFixed(4), lon: eye.lng.toFixed(4) });
    fetch(`${API}/api/transit/bus-stops?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ stops: BusStop[] }>) : { stops: [] }))
      .then((d) => {
        const seen = new Map(stops.map((s) => [s.id, s]));
        for (const s of d.stops ?? []) seen.set(s.id, s);
        stops = [...seen.values()].filter((s) => Math.hypot(...toLocal(s.lon, s.lat, eye)) < 600);
        shown = "";
        build();
      })
      .catch(() => {
        fetchedAt = null;
      });
  };

  const streetLines = (): Array<Array<[number, number]>> => {
    const out: Array<Array<[number, number]>> = [];
    if (!map.getSource("openmaptiles")) return out;
    for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" })) {
      const c = String(f.properties?.class);
      if (!["minor", "tertiary", "secondary", "primary", "trunk", "service"].includes(c)) continue;
      const g = f.geometry;
      if (g.type === "LineString") out.push(g.coordinates as Array<[number, number]>);
      else if (g.type === "MultiLineString") out.push(...(g.coordinates as Array<Array<[number, number]>>));
    }
    return out;
  };

  // Restroom points come from the GeoJSON sources' data, not rendered tiles:
  // at street level the 2D icon layers are hidden, so their tiles never load.
  let kioskData: Array<{ kind: PickTarget["kind"]; f: GeoJSON.Feature }> = [];
  let kioskStamp = "";
  const loadKiosks = () => {
    const want = (["restrooms", "place-toilets"] as const).filter((id) => (id === "restrooms" ? kioskSources.restrooms : kioskSources.places) && map.getSource(id));
    void Promise.all(
      want.map((id) =>
        (map.getSource(id) as unknown as { getData?: () => Promise<GeoJSON.GeoJSON> }).getData?.().then((d) => ({ id, d })).catch(() => null) ?? Promise.resolve(null),
      ),
    ).then((rows) => {
      const next: typeof kioskData = [];
      for (const r of rows) {
        if (!r || r.d.type !== "FeatureCollection") continue;
        for (const f of r.d.features) next.push({ kind: r.id === "restrooms" ? "restroom" : "place", f });
      }
      const stamp = `${next.length}:${want.join(",")}`;
      kioskData = next;
      if (stamp !== kioskStamp) {
        kioskStamp = stamp;
        shown = "";
        build();
      }
    });
  };

  const kiosks = (eye: { lng: number; lat: number }): PickTarget[] => {
    const out: Array<PickTarget & { d: number }> = [];
    for (const { kind, f } of kioskData) {
      if (f.geometry?.type !== "Point") continue;
      if (kind === "restroom" ? !kioskSources.restrooms : !kioskSources.places) continue;
      const [lng, lat] = f.geometry.coordinates;
      const d = Math.hypot(...toLocal(lng, lat, eye));
      if (d > KIOSK_RADIUS_M) continue;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const raw = props.id ?? props.name;
      const id = typeof raw === "string" || typeof raw === "number" ? String(raw) : `${lng},${lat}`;
      if (out.some((o) => o.kind === kind && o.id === id)) continue;
      out.push({ kind, id, lng, lat, h: KIOSK.h, props, d });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, KIOSK_MAX);
  };

  const build = () => {
    if (!map || map.getZoom() < FURN_MIN_ZOOM) {
      for (const m of all) m.count = 0;
      setPickTargets([]);
      return;
    }
    const eye = eyeLngLat(map);
    const near = stops
      .map((s) => ({ s, d: Math.hypot(...toLocal(s.lon, s.lat, eye)) }))
      .filter((x) => x.d < BUS_RADIUS_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, BUS_MAX)
      .map((x) => x.s);
    const ks = kiosks(eye);
    const key = near.map((s) => s.id).join(",") + "|" + ks.map((k) => k.id).join(",") + `|${eye.lng.toFixed(4)},${eye.lat.toFixed(4)}`;
    if (key === shown) return;
    shown = key;
    eyeAt = eye;
    origin = MercatorCoordinate.fromLngLat(eye, 0);
    meters = origin.meterInMercatorCoordinateUnits();
    const m = new THREE.Matrix4();
    const Z = new THREE.Vector3(0, 0, 1);
    const lines = near.length ? streetLines() : [];
    bg.clearRect(0, 0, busCanvas.width, busCanvas.height);
    let nf = 0;
    near.forEach((s, i) => {
      drawBusPlate(bg, i, s.routes);
      const [x, y] = toLocal(s.lon, s.lat, eye);
      const brg = streetBearingAt(lines, s.lon, s.lat, 40) ?? 0;
      const [ux, uy] = dirOf(brg);
      const u = new THREE.Vector3(ux, uy, 0); // along the street: the plate faces along it
      const n = new THREE.Vector3(uy, -ux, 0); // across the street: the plate's width
      m.makeTranslation(x, y, 0);
      busPoles.setMatrixAt(i, m);
      // The flag hangs off the pole toward the roadway side.
      const c = new THREE.Vector3(x, y, BUS_PLATE.z).addScaledVector(n, BUS_PLATE.w / 2 + 0.04);
      m.makeBasis(n.clone().multiplyScalar(BUS_PLATE.w), u.clone().multiplyScalar(BUS_PLATE.t), Z.clone().multiplyScalar(BUS_PLATE.h)).setPosition(c);
      busPlates.setMatrixAt(i, m);
      for (const side of [1, -1]) {
        const nn = u.clone().multiplyScalar(side);
        const right = new THREE.Vector3().crossVectors(Z, nn);
        m.makeBasis(right.multiplyScalar(BUS_PLATE.w * 0.96), Z.clone().multiplyScalar(BUS_PLATE.h * 0.97), nn)
          .setPosition(c.clone().addScaledVector(nn, BUS_PLATE.t / 2 + 0.004));
        busFaces.setMatrixAt(nf, m);
        busSlot.setXY(nf++, i % BUS_COLS, Math.floor(i / BUS_COLS));
      }
    });
    busPoles.count = near.length;
    busPlates.count = near.length;
    busFaces.count = nf;
    let kf = 0;
    ks.forEach((k, i) => {
      const [x, y] = toLocal(k.lng, k.lat, eye);
      m.makeTranslation(x, y, 0);
      kioskBodies.setMatrixAt(i, m);
      const access = k.kind === "restroom" ? 0 : String(k.props.access) === "anyone" ? 0 : 1;
      const variant = access * 2 + (wheelchairOf(k.props) ? 1 : 0);
      for (let f = 0; f < 4; f++) {
        const a = (f * Math.PI) / 2;
        const nn = new THREE.Vector3(Math.sin(a), Math.cos(a), 0);
        const right = new THREE.Vector3().crossVectors(Z, nn);
        m.makeBasis(right.multiplyScalar(KIOSK.panel * 0.94), Z.clone().multiplyScalar(KIOSK.panel * 0.94), nn)
          .setPosition(x + nn.x * (KIOSK.w / 2 + 0.005), y + nn.y * (KIOSK.w / 2 + 0.005), KIOSK.h - KIOSK.panel / 2 - 0.08);
        kioskFaces.setMatrixAt(kf, m);
        kioskSlot.setXY(kf++, variant, 0);
      }
    });
    kioskBodies.count = ks.length;
    kioskFaces.count = kf;
    setPickTargets(ks.map(({ kind, id, lng, lat, h, props }) => ({ kind, id, lng, lat, h, props })));
    for (const x of all) x.instanceMatrix.needsUpdate = true;
    busSlot.needsUpdate = true;
    kioskSlot.needsUpdate = true;
    busTex.needsUpdate = true;
    map.triggerRepaint();
  };

  const refresh = () => {
    if (!map || map.getZoom() < FURN_MIN_ZOOM) {
      build();
      return;
    }
    loadStops(eyeLngLat(map));
    loadKiosks();
    build();
  };
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId === "restrooms" || e.sourceId === "place-toilets") loadKiosks();
  };

  return {
    id: FURNITURE_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(mp, gl) {
      map = mp;
      renderer = sharedRenderer(mp, gl);
      mp.on("moveend", refresh);
      mp.on("sourcedata", onData);
      refresh();
    },
    onRemove(mp) {
      mp.off("moveend", refresh);
      mp.off("sourcedata", onData);
      setPickTargets([]);
      for (const x of all) {
        x.geometry.dispose();
        (x.material as THREE.Material).dispose();
      }
      busTex.dispose();
      kioskTex.dispose();
    },
    render(_gl, args: CustomRenderMethodInput) {
      const now = performance.now();
      if (now - lastCheck > 500) {
        lastCheck = now;
        const e = eyeLngLat(map);
        if (Math.hypot(...toLocal(e.lng, e.lat, eyeAt)) > 15) refresh();
      }
      if (map.getZoom() < FURN_MIN_ZOOM || (!busPoles.count && !kioskBodies.count)) return;
      const s = meters;
      const l = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z ?? 0).scale(new THREE.Vector3(s, -s, s));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}

// ---- Storefront signboards ----

/**
 * Storefront signboards (see the file header for the shared renderer).
 *
 * Storefront signboards at eye level: flat plates mounted on the facade. The
 * `storefronts` layer of the city tiles (scripts/storefronts.ts) gives each
 * sign its wall point, outward bearing, width and floor; this three.js custom
 * layer (same pinned three as the street signs) draws them in MapLibre's own
 * canvas and depth buffer as one InstancedMesh, text from one canvas atlas.
 * Only zoom >= STOREFRONT_MIN_ZOOM, within RADIUS_M of the centre, at most MAX.
 */
export const STOREFRONT_LAYER = "city3d-storefront-signs";
export const STOREFRONT_MIN_ZOOM = 17;
const RADIUS_M = 200;
const MAX = 64; // one 1024 x 1024 atlas: 2 x 32 slots of 512 x 32
const PLATE_H = 0.8;
const BASE_M = 3.2; // plate centre above the pavement on the ground floor
const FLOOR_M = 3.5;
const WALL_GAP_M = 0.15; // clear of the storefront band so depth never hides the plate

export const SIGN_COLORS: Record<string, string> = {
  food: "#9a3412", shop: "#1e3a8a", health: "#047857", money: "#3f3f46", service: "#4c1d95", mall: "#111827",
};

export interface StorefrontSign {
  name: string; cat: string; brg: number; sw: number; fl: number; lng: number; lat: number;
  main?: number; dir?: string;
}

/** Signs from the loaded tiles, nearest first, deduplicated across tile edges. */
export function nearbyStorefronts(map: MapLibreMap, radius = RADIUS_M, max = MAX): StorefrontSign[] {
  const { lng, lat } = map.getCenter();
  return signsNear(map, lng, lat, radius).slice(0, max);
}

function signsNear(map: MapLibreMap, lng: number, lat: number, radius: number): Array<StorefrontSign & { d: number }> {
  if (!map.getSource("city3d")) return [];
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const seen = new Map<string, StorefrontSign & { d: number }>();
  for (const f of map.querySourceFeatures("city3d", { sourceLayer: "storefronts" })) {
    if (f.geometry.type !== "Point") continue;
    const [x, y] = f.geometry.coordinates;
    const d = Math.hypot((x - lng) * kx, (y - lat) * 111_320);
    if (d > radius) continue;
    const p = f.properties as Omit<StorefrontSign, "lng" | "lat">;
    const key = `${x.toFixed(7)},${y.toFixed(7)},${p.name}`;
    if (!seen.has(key)) seen.set(key, { ...p, lng: x, lat: y, d });
  }
  return [...seen.values()].sort((a, b) => a.d - b.d);
}

/** The storefront sign nearest a point on a building's ground floor (eye-level picking). */
export function storefrontAt(map: MapLibreMap, lng: number, lat: number, radius = 12): StorefrontSign | null {
  return signsNear(map, lng, lat, radius)[0] ?? null;
}

/** The directory (main) sign nearest a clicked ground point, for the panel. */
export function directoryAt(map: MapLibreMap, lng: number, lat: number): StorefrontSign | null {
  if (map.getZoom() < STOREFRONT_MIN_ZOOM) return null;
  return signsNear(map, lng, lat, 25).find((s) => s.main === 1) ?? null;
}

function drawSlot(g: CanvasRenderingContext2D, i: number, s: StorefrontSign) {
  const x = (i % 2) * 512, y = Math.floor(i / 2) * 32;
  g.fillStyle = SIGN_COLORS[s.cat] ?? SIGN_COLORS.service;
  g.fillRect(x, y, 512, 32);
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineWidth = 2;
  g.strokeRect(x + 3, y + 3, 506, 26);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const text = s.main ? s.name.toUpperCase() : s.name;
  let size = 22;
  do g.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(text).width > 480 && (size -= 1) > 10);
  g.fillText(text, x + 256, y + 17);
}

export function createStorefrontLayer(): CustomLayerInterface {
  let map: MapLibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const g = canvas.getContext("2d")!;
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.encoding = THREE.sRGBEncoding;
  // One upload per changed sign set; no mipmap chain to rebuild.
  atlas.generateMipmaps = false;
  atlas.minFilter = THREE.LinearFilter;
  const uv = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("slot", uv);
  const material = new THREE.MeshBasicMaterial({ map: atlas, side: THREE.DoubleSide });
  // Each instance samples its own 512 x 32 cell of the atlas.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 slot;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvUv = vec2((slot.x + uv.x) * 0.5, 1.0 - (slot.y + 1.0 - uv.y) / 32.0);");
  };
  const mesh = new THREE.InstancedMesh(geometry, material, MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  let origin = new MercatorCoordinate(0, 0, 0);
  let scale = 1;
  let shown = "";
  let lastCheck = 0;
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId === "city3d" && e.isSourceLoaded) refresh();
  };

  const refresh = () => {
    if (map.getZoom() < STOREFRONT_MIN_ZOOM) {
      mesh.count = 0;
      shown = "";
      return;
    }
    // A main (mall / many-shop) sign also gets a small "Directory" board beside it.
    const signs = nearbyStorefronts(map).flatMap((s): Array<StorefrontSign & { dx?: number; z?: number }> =>
      s.main ? [s, { ...s, name: "Directory", main: 0, sw: 1.2, dx: Math.max(0.8, s.sw) / 2 + 0.9, z: 1.6 }] : [s],
    ).slice(0, MAX);
    // Real size at eye level; from higher up a 0.8 m plate is 2-4 px, so it
    // grows to stay about 14 px tall and readable (#67).
    const mpp = (78_271.517 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / 2 ** map.getZoom();
    const grow = Math.min(6, Math.max(1, (mpp * 14) / PLATE_H));
    const key = `${grow.toFixed(1)}|` + signs.map((s) => `${s.lng},${s.lat}`).join("|");
    if (key === shown) return;
    shown = key;
    const c = map.getCenter();
    origin = MercatorCoordinate.fromLngLat(c, 0);
    scale = origin.meterInMercatorCoordinateUnits();
    const kx = 111_320 * Math.cos((c.lat * Math.PI) / 180);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const m = new THREE.Matrix4();
    signs.forEach((s, i) => {
      drawSlot(g, i, s);
      uv.setXY(i, i % 2, Math.floor(i / 2));
      const b = (s.brg * Math.PI) / 180;
      const n = new THREE.Vector3(Math.sin(b), Math.cos(b), 0);
      const t = new THREE.Vector3(-Math.cos(b), Math.sin(b), 0);
      const h = (s.main ? 1.2 : PLATE_H) * grow;
      const w = Math.max(0.8, s.sw) * Math.min(grow, 2);
      const zc = Math.max(s.z ?? BASE_M + s.fl * FLOOR_M, h / 2 + 0.3);
      const pos = new THREE.Vector3((s.lng - c.lng) * kx, (s.lat - c.lat) * 111_320, zc)
        .addScaledVector(n, WALL_GAP_M * grow)
        .addScaledVector(t, (s.dx ?? 0) * grow);
      m.makeBasis(t.clone().multiplyScalar(w), new THREE.Vector3(0, 0, h), n).setPosition(pos);
      mesh.setMatrixAt(i, m);
    });
    mesh.count = signs.length;
    mesh.instanceMatrix.needsUpdate = true;
    uv.needsUpdate = true;
    atlas.needsUpdate = true;
    // refresh runs on moveend/idle, after the last frame: without a repaint the
    // new signs never reached the screen until the next camera move (#67).
    map.triggerRepaint();
  };

  return {
    id: STOREFRONT_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      map.on("moveend", refresh);
      map.on("idle", refresh);
      map.on("sourcedata", onData);
      refresh();
    },
    onRemove() {
      map.off("moveend", refresh);
      map.off("idle", refresh);
      map.off("sourcedata", onData);
      geometry.dispose();
      material.dispose();
      atlas.dispose();
    },
    render(_gl, args) {
      // Animated layers (weather, hazards) keep the map from ever going idle,
      // so also re-check the loaded tiles about once a second while drawing.
      const now = performance.now();
      if (now - lastCheck > 1000) {
        lastCheck = now;
        refresh();
      }
      if (!mesh.count) return;
      const l = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z ?? 0).scale(new THREE.Vector3(scale, -scale, scale));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}

// ---- Hero landmarks (glTF) ----
export const LANDMARKS_3D_LAYER = "city3d-landmarks";
export const LANDMARKS_MIN_ZOOM = 14;

/**
 * Empire State, Chrysler, One WTC and the Statue of Liberty as small glTF
 * models (public/models/landmarks, scripts/make-landmarks.ts, CC0), each
 * fetched only once the camera is within ~3 km. Their footprints are left out
 * of the tile extrusions, so the model is the building.
 */
export function createLandmarksLayer(): CustomLayerInterface {
  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a7a7a, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);
  const origin = MercatorCoordinate.fromLngLat([-73.99, 40.73], 0);
  const s = origin.meterInMercatorCoordinateUnits();
  const local = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(s, -s, s));
  const loading = new Set<string>();
  const loader = new GLTFLoader();

  const refresh = () => {
    if (!map || map.getZoom() < LANDMARKS_MIN_ZOOM) return;
    const c = map.getCenter();
    for (const l of LANDMARKS) {
      if (loading.has(l.id)) continue;
      const d = Math.hypot((l.lon - c.lng) * 111_320 * Math.cos((c.lat * Math.PI) / 180), (l.lat - c.lat) * 111_320);
      if (d > 3000) continue;
      loading.add(l.id);
      loader.load(`/models/landmarks/${l.id}.glb`, (gltf) => {
        const mc = MercatorCoordinate.fromLngLat([l.lon, l.lat], 0);
        const model = gltf.scene;
        model.position.set((mc.x - origin.x) / s, -(mc.y - origin.y) / s, 0);
        model.rotation.z = (-l.bearing * Math.PI) / 180;
        scene.add(model);
        map?.triggerRepaint();
      });
    }
  };

  return {
    id: LANDMARKS_3D_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      m.on("moveend", refresh);
      refresh();
    },
    onRemove(m) {
      m.off("moveend", refresh);
    },
    render(_gl, args) {
      if (!renderer || !map || map.getZoom() < LANDMARKS_MIN_ZOOM || scene.children.length <= 2) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}

// ---- Hero landmark models (authored here, CC0; exported to GLB by scripts/make-landmarks.ts) ----
const mat = (c: number, metal = 0.1, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough });
const LIME = mat(0xc9bfae), STEEL = mat(0xc7ccd2, 0.7, 0.35), GLASS = mat(0x6f90ab, 0.4, 0.25), DARK = mat(0x3b4148);
const COPPER = mat(0x6fb3a0, 0.3, 0.6), STONE = mat(0xb9ae9a);

/** Box w (x) by d (y), from z0 to z1. */
function box(g: THREE.Group, w: number, d: number, z0: number, z1: number, m: THREE.Material) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, d, z1 - z0), m);
  b.position.z = (z0 + z1) / 2;
  g.add(b);
}
/** Vertical frustum/cylinder with `seg` sides, radii r0 (bottom) r1 (top). */
function cyl(g: THREE.Group, r0: number, r1: number, z0: number, z1: number, m: THREE.Material, seg = 8, rot = 0) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, z1 - z0, seg), m);
  c.rotation.x = Math.PI / 2; // cylinder axis y -> z
  c.rotation.y = rot;
  c.position.z = (z0 + z1) / 2;
  g.add(c);
}

const LANDMARK_MODELS: Record<string, () => THREE.Group> = {
  "empire-state"() {
    const g = new THREE.Group();
    box(g, 57, 129, 0, 25, LIME);       // 5-storey base on the full lot
    box(g, 50, 90, 25, 81, LIME);       // first setback
    box(g, 42, 60, 81, 260, LIME);      // shaft
    box(g, 36, 50, 260, 320, LIME);     // upper setbacks
    box(g, 28, 36, 320, 373, LIME);     // 86th-floor observatory and crown
    cyl(g, 9, 7, 373, 395, STEEL, 8);   // mooring mast
    cyl(g, 2.5, 0.5, 395, 443, STEEL, 6); // antenna
    return g;
  },
  chrysler() {
    const g = new THREE.Group();
    box(g, 61, 61, 0, 60, STONE);
    box(g, 46, 46, 60, 120, STONE);
    box(g, 38, 38, 120, 240, STONE);
    // Terraced steel crown: shrinking rings, then the needle.
    for (let i = 0; i < 6; i++) cyl(g, 17 - i * 2.4, 15 - i * 2.4, 240 + i * 9, 249 + i * 9, STEEL, 16);
    cyl(g, 3, 0.3, 294, 319, STEEL, 8);
    return g;
  },
  "one-wtc"() {
    const g = new THREE.Group();
    box(g, 61, 61, 0, 57, DARK);                         // podium
    cyl(g, 43, 21.5, 57, 386, GLASS, 4, Math.PI / 4);    // tapering square shaft (rotated 45° at top reads as the chamfers)
    cyl(g, 21.5, 21.5, 386, 417, GLASS, 4, 0);           // parapet
    cyl(g, 1.8, 0.4, 417, 541, STEEL, 6);                // spire
    return g;
  },
  liberty() {
    const g = new THREE.Group();
    // Fort Wood star base, pedestal, statue (robe, raised arm with torch).
    cyl(g, 60, 60, 0, 8, STONE, 11);
    box(g, 20, 20, 8, 27, STONE);
    box(g, 13, 13, 27, 47, STONE);
    cyl(g, 7, 4.2, 47, 80, COPPER, 10);
    cyl(g, 3, 2.2, 80, 86, COPPER, 8);                   // head and crown
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 13, 6), COPPER);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(3.5, 0, 85);
    g.add(arm);
    cyl(g, 1.8, 2.6, 91, 93, mat(0xe8c15a, 0.6, 0.4), 8); // torch flame
    return g;
  },
};


/** GLB bytes for every hero landmark model (Node build step; the exporter is loaded on demand). */
export async function landmarkGlbs(): Promise<Record<string, ArrayBuffer>> {
  // Node-only (scripts/make-landmarks.ts). A non-literal specifier keeps Vite from
  // emitting the ~7.7 kB br exporter chunk into the app bundle.
  const exporterPath = "three/examples/jsm/exporters/GLTFExporter.js";
  const { GLTFExporter } = (await import(/* @vite-ignore */ exporterPath)) as typeof import("three/examples/jsm/exporters/GLTFExporter.js");
  const exporter = new GLTFExporter();
  const out: Record<string, ArrayBuffer> = {};
  for (const [id, make] of Object.entries(LANDMARK_MODELS)) {
    const scene = new THREE.Scene();
    scene.add(make());
    out[id] = await new Promise<ArrayBuffer>((res) => exporter.parse(scene, (r) => res(r as ArrayBuffer), { binary: true }));
  }
  return out;
}
