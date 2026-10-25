/**
 * What every three.js layer shares: one WebGLRenderer per MapLibre GL context
 * (several renderers on one context each kept their own GL state cache, and
 * with all layers on at street level the headless SwiftShader context was lost,
 * #98), the 0.134 colour and light settings, and MapLibre's projection helper.
 */
import * as THREE from "three";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { toLocal } from "../signPlacement";
export { MercatorCoordinate };
export type MapLibreMap = MaplibreMap;

/** Rebuild a street layer after the camera has moved about this far. Looking around stays under it. */
export const REBUILD_M = 15;
export function movedM(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  return Math.hypot(...toLocal(a.lng, a.lat, b));
}

// three 0.152+ converts hex colours to linear and 0.165+ dropped the legacy light
// scale. The scenes were tuned on 0.134, so keep its colour handling and
// multiply each light by π, which is what the legacy mode did inside.
THREE.ColorManagement.enabled = false;
export const LEGACY_LIGHT = Math.PI;

const renderers = new WeakMap<WebGLRenderingContext | WebGL2RenderingContext, THREE.WebGLRenderer>();

/** One three.js renderer per MapLibre GL context, shared by every custom layer. */
export function sharedRenderer(map: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): THREE.WebGLRenderer {
  let r = renderers.get(gl);
  if (!r) {
    r = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    r.autoClear = false;
    r.outputColorSpace = THREE.SRGBColorSpace;
    renderers.set(gl, r);
  }
  return r;
}
