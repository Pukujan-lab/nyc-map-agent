/**
 * The ONLY file that imports three.js. Every three.js custom layer lives here
 * (3D vehicles, corner street-name signs, storefront signboards) and they all
 * draw through ONE WebGLRenderer per MapLibre GL context (sharedRenderer):
 * several renderers on one context each kept their own GL state cache, and
 * with all three layers on at street level the headless SwiftShader context
 * was lost (#98). Layers only repaint when their content changes.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MaplibreMap } from "maplibre-gl";

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

// ---- 3D vehicles ----

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

  const layer: CustomLayerInterface = {
    id: VEHICLES_3D_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
    },
    onRemove() {
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
  return { layer, update };
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
const SIGNS_RADIUS_M = 300;
const SIGNS_MAX = 60;
const SCALE = 1.15; // model is 3.04 m with 0.6 m blades; NYC poles are ~3.5 m
const CORNER_M = 8; // from the centreline crossing to the corner, along the bisector
// Blade faces in model metres: lower blade runs along X, upper along Z.
const BLADES = [
  { y: 2.775, axis: "x" as const, half: 0.0175 },
  { y: 2.9535, axis: "z" as const, half: 0.0175 },
];
const DECAL_W = 0.58;
const DECAL_H = 0.14;

interface Sign {
  key: string;
  lng: number;
  lat: number;
  a: string;
  b: string;
  ba: number;
  bb: number;
}

function bladeTexture(name: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 124;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b6b3a";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 6;
  g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 72;
  do g.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(name).width > c.width - 48 && (size -= 4) > 24);
  g.fillText(name, c.width / 2, c.height / 2 + 3);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}

/** Picks the nearest signs from the loaded tiles. */
function nearbySigns(map: MapLibreMap): Sign[] {
  const { lng, lat } = map.getCenter();
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const seen = new Map<string, Sign & { d: number }>();
  for (const f of map.querySourceFeatures("city3d", { sourceLayer: "signs" })) {
    if (f.geometry.type !== "Point") continue;
    const [x, y] = f.geometry.coordinates;
    const d = Math.hypot((x - lng) * kx, (y - lat) * 111_320);
    if (d > SIGNS_RADIUS_M) continue;
    const p = f.properties as { a: string; b: string; ba: number; bb: number };
    const key = `${x.toFixed(6)},${y.toFixed(6)}`;
    if (!seen.has(key)) seen.set(key, { key, lng: x, lat: y, ...p, d });
  }
  return [...seen.values()].sort((p, q) => p.d - q.d).slice(0, SIGNS_MAX);
}

export function createStreetSignsLayer(): CustomLayerInterface {
  let map: MapLibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const group = new THREE.Group();
  let model: THREE.Object3D | null = null;
  let origin = new MercatorCoordinate(0, 0, 0);
  let meters = 1;
  const placed = new Map<string, THREE.Object3D>();
  const decalGeo = new THREE.PlaneGeometry(DECAL_W, DECAL_H);

  const build = (s: Sign): THREE.Object3D => {
    const root = model!.clone();
    root.scale.setScalar(SCALE);
    BLADES.forEach((blade, i) => {
      const mat = new THREE.MeshStandardMaterial({ map: bladeTexture(i === 0 ? s.a : s.b), roughness: 0.6 });
      for (const side of [1, -1]) {
        const m = new THREE.Mesh(decalGeo, mat);
        m.position.y = blade.y;
        if (blade.axis === "x") {
          m.position.z = side * (blade.half + 0.004);
          m.rotation.y = side > 0 ? 0 : Math.PI;
        } else {
          m.position.x = side * (blade.half + 0.004);
          m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        root.add(m);
      }
    });
    // Scene x = east, z = south (metres). Lower blade (model X) along street A.
    const wrap = new THREE.Group();
    wrap.add(root);
    root.rotation.y = ((90 - s.ba) * Math.PI) / 180;
    const ua = [Math.sin((s.ba * Math.PI) / 180), -Math.cos((s.ba * Math.PI) / 180)];
    const ub = [Math.sin((s.bb * Math.PI) / 180), -Math.cos((s.bb * Math.PI) / 180)];
    const bis = [ua[0] + ub[0], ua[1] + ub[1]];
    const len = Math.hypot(bis[0], bis[1]) || 1;
    wrap.userData = { lng: s.lng, lat: s.lat, off: [(bis[0] / len) * CORNER_M, (bis[1] / len) * CORNER_M] };
    return wrap;
  };

  const place = (o: THREE.Object3D) => {
    const { lng, lat, off } = o.userData as { lng: number; lat: number; off: number[] };
    const mc = MercatorCoordinate.fromLngLat([lng, lat], 0);
    o.position.set((mc.x - origin.x) / meters + off[0], 0, (mc.y - origin.y) / meters + off[1]);
  };

  const refresh = () => {
    if (!model || map.getZoom() < SIGNS_MIN_ZOOM) return;
    origin = MercatorCoordinate.fromLngLat(map.getCenter(), 0);
    meters = origin.meterInMercatorCoordinateUnits();
    const want = nearbySigns(map);
    const keep = new Set(want.map((s) => s.key));
    for (const [key, o] of placed) {
      if (keep.has(key)) continue;
      group.remove(o);
      o.traverse((c) => {
        if (c instanceof THREE.Mesh && c.geometry === decalGeo) {
          const mat = c.material as THREE.MeshStandardMaterial;
          mat.map?.dispose();
          mat.dispose();
        }
      });
      placed.delete(key);
    }
    for (const s of want) {
      if (!placed.has(s.key)) {
        const o = build(s);
        placed.set(s.key, o);
        group.add(o);
      }
    }
    for (const o of placed.values()) place(o);
    map.triggerRepaint();
  };

  return {
    id: STREET_SIGNS_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 0.9);
      sun.position.set(0.4, 1, 0.6);
      scene.add(sun, group);
      new GLTFLoader().load("/models/street-name-sign.glb", (gltf) => {
        model = gltf.scene;
        refresh();
      });
      m.on("moveend", refresh);
      m.on("sourcedata", (e) => {
        if (e.sourceId === "city3d" && e.isSourceLoaded) refresh();
      });
    },
    onRemove(m) {
      m.off("moveend", refresh);
    },
    render(_gl, args: CustomRenderMethodInput) {
      if (!model || map.getZoom() < SIGNS_MIN_ZOOM || placed.size === 0) return;
      const s = meters;
      // Scene is right-handed y-up metres (x = east, z = south); mercator is z-up with +y south.
      const toMerc = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new THREE.Vector3(s, s, s))
        .multiply(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
      camera.projectionMatrix = new THREE.Matrix4()
        .fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
        .multiply(toMerc);
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
      uv.setXY(i, i % 2, Math.floor(i / 2));
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
      renderer = sharedRenderer(m, gl);
      map.on("moveend", refresh);
      map.on("idle", refresh);
      refresh();
    },
    onRemove() {
      map.off("moveend", refresh);
      map.off("idle", refresh);
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
