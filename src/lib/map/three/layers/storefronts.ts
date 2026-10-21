import * as THREE from "three";
import type { CustomLayerInterface, Map as MapLibreMap } from "maplibre-gl";
import { drawScene, sharedRenderer } from "../context";
import { frameAt, localMatrix, metersPerPixel, toLocal } from "../projection";
import { STOREFRONT_MAX, STOREFRONT_MIN_ZOOM, nearbyStorefronts, type StorefrontSign } from "../picking";

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
const PLATE_H = 0.8;
const BASE_M = 3.2; // plate centre above the pavement on the ground floor
const FLOOR_M = 3.5;
const WALL_GAP_M = 0.15; // clear of the storefront band so depth never hides the plate

export const SIGN_COLORS: Record<string, string> = {
  food: "#9a3412", shop: "#1e3a8a", health: "#047857", money: "#3f3f46", service: "#4c1d95", mall: "#111827",
};

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
  atlas.colorSpace = THREE.SRGBColorSpace;
  // One upload per changed sign set; no mipmap chain to rebuild.
  atlas.generateMipmaps = false;
  atlas.minFilter = THREE.LinearFilter;
  const uv = new THREE.InstancedBufferAttribute(new Float32Array(STOREFRONT_MAX * 2), 2);
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("slot", uv);
  const material = new THREE.MeshBasicMaterial({ map: atlas, side: THREE.DoubleSide });
  // Each instance samples its own 512 x 32 cell of the atlas.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 slot;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vec2((slot.x + uv.x) * 0.5, 1.0 - (slot.y + 1.0 - uv.y) / 32.0);");
  };
  const mesh = new THREE.InstancedMesh(geometry, material, STOREFRONT_MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  let frame = frameAt([0, 0]);
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
    ).slice(0, STOREFRONT_MAX);
    // Real size at eye level; from higher up a 0.8 m plate is 2-4 px, so it
    // grows to stay about 14 px tall and readable (#67).
    const mpp = metersPerPixel(map.getCenter().lat, map.getZoom());
    const grow = Math.min(6, Math.max(1, (mpp * 14) / PLATE_H));
    const key = `${grow.toFixed(1)}|` + signs.map((s) => `${s.lng},${s.lat}`).join("|");
    if (key === shown) return;
    shown = key;
    const c = map.getCenter();
    frame = frameAt(c);
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
      const pos = new THREE.Vector3(...toLocal(frame, s.lng, s.lat), zc)
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
      drawScene(renderer, scene, camera, args, localMatrix(frame));
    },
  };
}
