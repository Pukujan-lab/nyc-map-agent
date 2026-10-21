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
  const steel = "#4b5a4f", rail = "#a3a3a3";
  const parts: Part[] = [
    { w: 0.9, l: 0.9, h: top - 1.4, x: -3.2, z: -top, color: steel },
    { w: 0.9, l: 0.9, h: top - 1.4, x: 3.2, z: -top, color: steel },
    { w: 7.6, l: 0.7, h: 0.6, x: 0, z: -1.6, color: steel }, // cap beam on the columns
    { w: 0.5, l: len, h: 1.4, x: -3.6, z: -1.4, color: steel },
    { w: 0.5, l: len, h: 1.4, x: 3.6, z: -1.4, color: steel },
    { w: 7.2, l: len, h: 0.3, x: 0, z: -0.3, color: "#57534e" },
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
  const steelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
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
  return { layer, update, setStructure };
}
