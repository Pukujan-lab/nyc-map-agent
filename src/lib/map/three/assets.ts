/** Asset loading: glTF loaders (meshopt on demand) and fitting vehicle models to scene space. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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

/** A plain glTF loader (street sign, landmarks). */
export function gltfLoader(): GLTFLoader {
  return new GLTFLoader();
}

/** A glTF loader with the meshopt decoder; the decoder is only needed for vehicle models, so it is kept out of the shared 3D chunk. */
export async function meshoptGltfLoader(): Promise<GLTFLoader> {
  const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js");
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

/** meshopt/quantized glTF stores positions as normalized ints; transforms would clamp them, so expand to float first. */
function dequantize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of ["position", "normal"]) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    if (!a) continue;
    const raw = "isInterleavedBufferAttribute" in a ? a.data.array : a.array;
    if (raw instanceof Float32Array && !a.normalized) continue;
    // getX/getY/getZ already map normalized ints to [-1, 1] / [0, 1] (three r1xx+).
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      out[i * 3] = a.getX(i);
      out[i * 3 + 1] = a.getY(i);
      out[i * 3 + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  return g;
}

/** glTF (Y up, any axis along the car) to scene space: Z up, length along +Y, base on z = 0, scaled to `length` m. */
export function vehicleParts(root: THREE.Object3D, length: number): Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> {
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
