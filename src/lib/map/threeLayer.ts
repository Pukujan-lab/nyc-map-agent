/**
 * Shared three.js custom layer (the only place besides streetSigns.ts that may
 * import three). Today it draws moving vehicles as real 3D meshes: ONE MapLibre custom layer drawing
 * three.js into the map's own canvas and depth buffer (no second canvas, no
 * deck.gl). Low-poly procedural bodies (a tapered car / bus box), instanced so
 * the whole fleet is two draw calls, tinted per line. Underground trains are
 * translucent "ghosts" drawn without depth test so they read through the
 * ground from above. Loaded lazily the first time the map is tilted.
 *
 * It also draws the procedural elevated structure ("the el"): one 15 m bay
 * (two columns, side girders, a deck slab, two tracks of rails; plus platform,
 * canopy and windscreen at stations) stamped along the viaduct, merged into a
 * single mesh per ~1 km chunk, built lazily for chunks near the camera only.
 */
import * as THREE from "three";
import { MercatorCoordinate, type CustomLayerInterface, type Map as MaplibreMap } from "maplibre-gl";

/** One moving body. `z` is metres above ground; `ghost` draws it translucent through the ground. */
export interface VehicleInstance {
  lon: number;
  lat: number;
  bearing: number;
  z: number;
  color: string;
  kind: "train" | "bus";
  ghost: boolean;
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
    const mat = new THREE.MeshLambertMaterial(ghost ? { transparent: true, opacity: 0.35, depthTest: false, depthWrite: false } : {});
    const mesh = new THREE.InstancedMesh(geom, mat, CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  };
  const trains = make(bodyGeometry(20, 3, 3.8), false);
  const buses = make(bodyGeometry(12, 2.6, 3.2), false);
  const ghosts = make(bodyGeometry(20, 3, 3.8), true);
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
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      m.on("moveend", syncChunks);
      syncChunks();
    },
    onRemove() {
      map?.off("moveend", syncChunks);
      renderer?.dispose();
      renderer = null;
    },
    render(_gl, args) {
      if (!renderer) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };

  /** Push the tweened vehicles (already culled and capped by the caller). */
  function update(vehicles: VehicleInstance[]) {
    let t = 0, b = 0, g = 0;
    for (const v of vehicles) {
      const ghost = v.ghost;
      const mesh = v.kind === "bus" ? buses : ghost ? ghosts : trains;
      const i = v.kind === "bus" ? b++ : ghost ? g++ : t++;
      if (i >= CAP) continue;
      const mc = MercatorCoordinate.fromLngLat([v.lon, v.lat], 0);
      p.set((mc.x - origin.x) / s, -(mc.y - origin.y) / s, v.z);
      q.setFromAxisAngle(zAxis, (-v.bearing * Math.PI) / 180);
      mesh.setMatrixAt(i, m4.compose(p, q, one));
      mesh.setColorAt(i, color.set(v.color));
    }
    for (const [mesh, n] of [[trains, t], [buses, b], [ghosts, g]] as const) {
      mesh.count = Math.min(n, CAP);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    map?.triggerRepaint();
  }
  return { layer, update, setStructure, setEntrances };
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
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      m.on("moveend", refresh);
      m.on("sourcedata", onData);
      refresh();
    },
    onRemove(m) {
      m.off("moveend", refresh);
      m.off("sourcedata", onData);
      renderer?.dispose();
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
