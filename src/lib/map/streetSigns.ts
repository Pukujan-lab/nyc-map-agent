import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.outputEncoding = THREE.sRGBEncoding;
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
      map.triggerRepaint();
    },
  };
}
