/** Hero landmark models, and their GLB export for the build. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LANDMARKS } from "../landmarks";
import type { CustomLayerInterface, Map as MaplibreMap } from "maplibre-gl";
import { MercatorCoordinate, LEGACY_LIGHT, sharedRenderer } from "./core";

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
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a7a7a, 1.15 * LEGACY_LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2 * LEGACY_LIGHT);
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
    out[id] = await new Promise<ArrayBuffer>((res, rej) => exporter.parse(scene, (r) => res(r as ArrayBuffer), (e) => rej(new Error(e.message)), { binary: true }));
  }
  return out;
}
