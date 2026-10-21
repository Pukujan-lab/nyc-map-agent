/**
 * The shared three.js renderer for every MapLibre custom layer. All layers draw
 * through ONE WebGLRenderer per MapLibre GL context: several renderers on one
 * context each kept their own GL state cache, and with all three layers on at
 * street level the headless SwiftShader context was lost (#98).
 */
import * as THREE from "three";
import type { CustomRenderMethodInput, Map as MaplibreMap } from "maplibre-gl";

// three r152+ converts hex/CSS colours from sRGB to linear before lighting; 0.134 used them as-is.
// Every colour and light here was tuned against 0.134, so keep the legacy colour workflow
// (output is still sRGB-encoded, as with 0.134's outputEncoding = sRGBEncoding).
THREE.ColorManagement.enabled = false;
/** three r155+ lights are physically correct (no implicit x PI); multiply to keep the 0.134 (legacy) brightness. */
const LEGACY = Math.PI;

type GL = WebGLRenderingContext | WebGL2RenderingContext;
const renderers = new WeakMap<GL, THREE.WebGLRenderer>();

/** One three.js renderer per MapLibre GL context, shared by every custom layer. Never dispose it from a layer. */
export function sharedRenderer(map: MaplibreMap, gl: GL): THREE.WebGLRenderer {
  let r = renderers.get(gl);
  if (!r) {
    r = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    r.autoClear = false;
    r.outputColorSpace = THREE.SRGBColorSpace;
    renderers.set(gl, r);
  }
  return r;
}

/**
 * Draw `scene` into MapLibre's frame: the camera is MapLibre's projection times
 * the layer's local-to-mercator matrix. MapLibre changed GL state since the
 * renderer last drew, so its state cache is reset first.
 */
export function drawScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, args: CustomRenderMethodInput, local: THREE.Matrix4): void {
  camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local);
  renderer.resetState();
  renderer.render(scene, camera);
}

/** Ambient-style fill plus a sun, scaled for physically correct lights. */
export function addLights(scene: THREE.Scene, fill: THREE.Light, sun: { intensity: number; position: [number, number, number] }): void {
  fill.intensity *= LEGACY;
  const d = new THREE.DirectionalLight(0xffffff, sun.intensity * LEGACY);
  d.position.set(...sun.position);
  scene.add(fill, d);
}
