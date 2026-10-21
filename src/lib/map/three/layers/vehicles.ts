/**
 * 3D vehicles (instanced box stand-ins, swapped for glTF models once they
 * load), plus the elevated structure, street entrances and the x-ray station
 * view, all in one scene and one custom layer.
 */
import * as THREE from "three";
import type { CustomLayerInterface, Map as MaplibreMap } from "maplibre-gl";
import { drawScene, sharedRenderer, addLights } from "../context";
import { bearingToZ, frameAt, localMatrix, toLocal } from "../projection";
import { VEHICLE_MODELS, meshoptGltfLoader, vehicleParts, type VehicleMode } from "../assets";
import { STRUCTURE_MINZOOM, STRUCTURE_STEEL, buildChunk, chunkKey, entranceKits, wantedChunks, type BayInstance, type EntranceKitInstance } from "./structure";
import { buildXray, disposeXray, type XrayPrim } from "./xray";

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
  addLights(scene, new THREE.AmbientLight(0xffffff, 1.6), { intensity: 1.4, position: [0.4, -0.6, 1] });
  const frame = frameAt([-73.97, 40.73]);
  const local = localMatrix(frame);

  const make = (geom: THREE.BufferGeometry, ghost: boolean) => {
    const mat = new THREE.MeshLambertMaterial(ghost ? { transparent: true, opacity: 0.35, depthTest: false, depthWrite: false } : {});
    const mesh = new THREE.InstancedMesh(geom, mat, CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  };
  const boxes: Record<VehicleMode, THREE.InstancedMesh> = {
    subway: make(bodyGeometry(20, 3, 3.8), false),
    rail: make(bodyGeometry(20, 3, 3.8), false),
    bus: make(bodyGeometry(12, 2.6, 3.2), false),
  };
  const ghosts = make(bodyGeometry(20, 3, 3.8), true);
  /** Loaded glTF parts per mode, one InstancedMesh each; empty until the model arrives. */
  const models: Record<VehicleMode, THREE.InstancedMesh[]> = { subway: [], rail: [], bus: [] };
  let last: VehicleInstance[] = [];
  function loadModels() {
    void meshoptGltfLoader().then((loader) => {
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
  const steelMat = STRUCTURE_STEEL();
  let bayChunks = new Map<string, BayInstance[]>();
  const built = new Map<string, THREE.Mesh>();
  function syncChunks() {
    if (!map) return;
    const c = map.getCenter();
    const want = map.getZoom() >= STRUCTURE_MINZOOM ? wantedChunks(c.lng, c.lat) : new Set<string>();
    for (const [k, mesh] of built) if (!want.has(k)) { scene.remove(mesh); mesh.geometry.dispose(); built.delete(k); }
    for (const k of want) {
      const bays = bayChunks.get(k);
      if (bays && !built.has(k)) { const mesh = buildChunk(bays, frame, steelMat); built.set(k, mesh); scene.add(mesh); }
    }
  }
  // ---- Street entrances ----
  const kits = entranceKits();
  scene.add(...kits.meshes);
  function setEntrances(list: EntranceKitInstance[]) {
    kits.set(list, frame);
    map?.triggerRepaint();
  }

  // ---- X-ray station view: one group, rebuilt per station. ----
  let xray: THREE.Group | null = null;
  /** Show one station's insides around `center` (null clears). */
  function setXray(center: [number, number] | null, prims: XrayPrim[] = []) {
    if (xray) { scene.remove(xray); disposeXray(xray); xray = null; }
    if (center) {
      xray = buildXray(frame, center, prims);
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
      drawScene(renderer, scene, camera, args, local);
    },
  };

  /** Push the tweened vehicles (already culled and capped by the caller). */
  function update(vehicles: VehicleInstance[]) {
    last = vehicles;
    const n: Record<VehicleMode, number> = { subway: 0, rail: 0, bus: 0 };
    let g = 0;
    for (const v of vehicles) {
      p.set(...toLocal(frame, v.lon, v.lat), v.z);
      q.setFromAxisAngle(zAxis, bearingToZ(v.bearing));
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
  return { layer, update, setStructure, setEntrances, setXray };
}
