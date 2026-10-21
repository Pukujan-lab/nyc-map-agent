import type { CustomLayerInterface, Map as MapLibreMap } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";

/**
 * Shared three.js custom layers (with streetSigns.ts, the only files that import three).
 *
 * Storefront signboards at eye level: flat plates mounted on the facade. The
 * `storefronts` layer of the city tiles (scripts/storefronts.ts) gives each
 * sign its wall point, outward bearing, width and floor; this three.js custom
 * layer (same pinned three as the street signs) draws them in MapLibre's own
 * canvas and depth buffer as one InstancedMesh, text from one canvas atlas.
 * Only zoom >= SIGNS_MIN_ZOOM, within RADIUS_M of the centre, at most MAX.
 */
export const STOREFRONT_LAYER = "city3d-storefront-signs";
export const SIGNS_MIN_ZOOM = 17;
const RADIUS_M = 200;
const MAX = 128; // atlas: 4 x 32 slots of 512 x 64
const PLATE_H = 0.8;
const BASE_M = 3.2; // plate centre above the pavement on the ground floor
const FLOOR_M = 3.5;
const WALL_GAP_M = 0.05;

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

/** The directory (main) sign nearest a clicked ground point, for the panel. */
export function directoryAt(map: MapLibreMap, lng: number, lat: number): StorefrontSign | null {
  if (map.getZoom() < SIGNS_MIN_ZOOM) return null;
  return signsNear(map, lng, lat, 25).find((s) => s.main === 1) ?? null;
}

function drawSlot(g: CanvasRenderingContext2D, i: number, s: StorefrontSign) {
  const x = (i % 4) * 512, y = Math.floor(i / 4) * 64;
  g.fillStyle = SIGN_COLORS[s.cat] ?? SIGN_COLORS.service;
  g.fillRect(x, y, 512, 64);
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineWidth = 3;
  g.strokeRect(x + 4, y + 4, 504, 56);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const text = s.main ? s.name.toUpperCase() : s.name;
  let size = 40;
  do g.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(text).width > 480 && (size -= 2) > 14);
  g.fillText(text, x + 256, y + 34);
}

export function createStorefrontLayer(): CustomLayerInterface {
  let map: MapLibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 2048;
  const g = canvas.getContext("2d")!;
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.encoding = THREE.sRGBEncoding;
  atlas.anisotropy = 8;
  const uv = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("slot", uv);
  const material = new THREE.MeshBasicMaterial({ map: atlas, side: THREE.DoubleSide });
  // Each instance samples its own 512 x 64 cell of the atlas.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 slot;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvUv = vec2((slot.x + uv.x) * 0.25, 1.0 - (slot.y + 1.0 - uv.y) / 32.0);");
  };
  const mesh = new THREE.InstancedMesh(geometry, material, MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  let origin = new MercatorCoordinate(0, 0, 0);
  let scale = 1;
  let shown = "";

  const refresh = () => {
    if (map.getZoom() < SIGNS_MIN_ZOOM) {
      mesh.count = 0;
      shown = "";
      return;
    }
    // A main (mall / many-shop) sign also gets a small "Directory" board beside it.
    const signs = nearbyStorefronts(map).flatMap((s): Array<StorefrontSign & { dx?: number; z?: number }> =>
      s.main ? [s, { ...s, name: "Directory", main: 0, sw: 1.2, dx: Math.max(0.8, s.sw) / 2 + 0.9, z: 1.6 }] : [s],
    ).slice(0, MAX);
    const key = signs.map((s) => `${s.lng},${s.lat}`).join("|");
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
      uv.setXY(i, i % 4, Math.floor(i / 4));
      const b = (s.brg * Math.PI) / 180;
      const n = new THREE.Vector3(Math.sin(b), Math.cos(b), 0);
      const t = new THREE.Vector3(-Math.cos(b), Math.sin(b), 0);
      const h = s.main ? 1.2 : PLATE_H;
      const pos = new THREE.Vector3((s.lng - c.lng) * kx, (s.lat - c.lat) * 111_320, s.z ?? BASE_M + s.fl * FLOOR_M)
        .addScaledVector(n, WALL_GAP_M)
        .addScaledVector(t, s.dx ?? 0);
      m.makeBasis(t.clone().multiplyScalar(Math.max(0.8, s.sw)), new THREE.Vector3(0, 0, h), n).setPosition(pos);
      mesh.setMatrixAt(i, m);
    });
    mesh.count = signs.length;
    mesh.instanceMatrix.needsUpdate = true;
    uv.needsUpdate = true;
    atlas.needsUpdate = true;
  };

  return {
    id: STOREFRONT_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      map.on("moveend", refresh);
      map.on("sourcedata", refresh);
      refresh();
    },
    onRemove() {
      map.off("moveend", refresh);
      map.off("sourcedata", refresh);
      geometry.dispose();
      material.dispose();
      atlas.dispose();
    },
    render(_gl, args) {
      if (!mesh.count) return;
      const l = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z ?? 0).scale(new THREE.Vector3(scale, -scale, scale));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}
