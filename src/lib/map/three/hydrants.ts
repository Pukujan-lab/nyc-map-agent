/** Fire hydrants near the eye at street level. */
import * as THREE from "three";
import type { CustomLayerInterface, Map as MaplibreMap } from "maplibre-gl";
import { MercatorCoordinate, REBUILD_M, movedM, LEGACY_LIGHT, sharedRenderer } from "./core";

export const HYDRANTS_3D_LAYER = "city3d-hydrants";
const HYDRANT_CAP = 400;
const HYDRANT_RADIUS_M = 350;
const HYDRANT_MIN_ZOOM = 16;

/** One hydrant point: where it stands and which way its pumper nozzle faces (degrees). */
export interface HydrantInstance {
  lon: number;
  lat: number;
  facing: number;
}

/** Lathe around the vertical (z) axis from a [radius, height] profile in metres. */
function lathe(profile: Array<[number, number]>, segments = 14): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), segments);
  g.rotateX(Math.PI / 2); // lathe is y-up; the map scene is z-up
  g.computeVertexNormals();
  return g;
}

/**
 * The NYC hydrant silhouette (the Kennedy / Mueller "Guardian" on most corners):
 * a wide base flange, a stout red barrel, a silver domed bonnet with a
 * pentagon operating nut, two side hose nozzles and a bigger front pumper
 * nozzle, all ~0.8 m tall. Procedural, a few hundred triangles.
 */
function hydrantParts() {
  const body = lathe([
    [0.001, 0], [0.17, 0], [0.17, 0.035], [0.13, 0.05], [0.115, 0.08],
    [0.105, 0.5], [0.125, 0.52], [0.125, 0.58], [0.001, 0.58],
  ]);
  const bonnet = lathe([
    [0.001, 0.58], [0.12, 0.58], [0.115, 0.63], [0.085, 0.69], [0.04, 0.715],
    [0.035, 0.715], [0.035, 0.78], [0.001, 0.78],
  ], 10);
  // Nozzle along +x from the barrel axis, unit length scaled per instance.
  const nozzle = new THREE.CylinderGeometry(1, 1, 1, 10);
  nozzle.rotateZ(Math.PI / 2);
  nozzle.translate(0.5, 0, 0);
  return { body, bonnet, nozzle };
}

/** Deterministic 0..360 from a position, so a hydrant keeps its facing between frames. */
export function hydrantFacing(lon: number, lat: number): number {
  const h = Math.sin(lon * 12_989.8 + lat * 78_233.1) * 43_758.5453;
  return Math.round((h - Math.floor(h)) * 4) * 90;
}

/** Hydrants near the map centre from the city tiles' `props` layer (kind = hydrant). */
export function nearbyHydrants(map: MaplibreMap): HydrantInstance[] {
  if (!map.getSource("city3d") || map.getZoom() < HYDRANT_MIN_ZOOM) return [];
  const { lng, lat } = map.getCenter();
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const seen = new Map<string, HydrantInstance & { d: number }>();
  for (const f of map.querySourceFeatures("city3d", { sourceLayer: "props", filter: ["==", ["get", "kind"], "hydrant"] })) {
    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : undefined;
    if (!ring?.length) continue;
    let x = 0, y = 0;
    const n = ring.length - 1 || 1;
    for (let i = 0; i < n; i++) {
      x += ring[i][0];
      y += ring[i][1];
    }
    x /= n;
    y /= n;
    const d = Math.hypot((x - lng) * kx, (y - lat) * 111_320);
    if (d > HYDRANT_RADIUS_M) continue;
    const key = `${x.toFixed(6)},${y.toFixed(6)}`;
    if (!seen.has(key)) seen.set(key, { lon: x, lat: y, facing: hydrantFacing(x, y), d });
  }
  return [...seen.values()].sort((a, b) => a.d - b.d).slice(0, HYDRANT_CAP);
}

/**
 * Instanced NYC hydrants, drawn in MapLibre's canvas and depth buffer like the
 * vehicles. Replaces the red hexagonal stubs the `city3d-props` extrusion draws
 * (that layer gets a filter dropping kind = hydrant once this one is added).
 */
export function createHydrantLayer(): CustomLayerInterface {
  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6b6b, 1.2 * LEGACY_LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1 * LEGACY_LIGHT);
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);
  const origin = MercatorCoordinate.fromLngLat([-73.97, 40.73], 0);
  const s = origin.meterInMercatorCoordinateUnits();
  const local = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(s, -s, s));

  const parts = hydrantParts();
  const red = new THREE.MeshLambertMaterial({ color: 0xc8352b });
  const silver = new THREE.MeshLambertMaterial({ color: 0xc9ccd1 });
  const make = (geom: THREE.BufferGeometry, mat: THREE.Material, cap: number) => {
    const mesh = new THREE.InstancedMesh(geom, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  };
  const bodies = make(parts.body, red, HYDRANT_CAP);
  const bonnets = make(parts.bonnet, silver, HYDRANT_CAP);
  const nozzles = make(parts.nozzle, silver, HYDRANT_CAP * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const zAxis = new THREE.Vector3(0, 0, 1), sc = new THREE.Vector3(), off = new THREE.Vector3();
  // [angle from facing, height, radius, length]: front pumper, two side hose outlets.
  const NOZZLES: Array<[number, number, number, number]> = [[0, 0.4, 0.06, 0.2], [90, 0.44, 0.04, 0.17], [-90, 0.44, 0.04, 0.17]];
  let builtAt = { lng: 0, lat: 0 };
  let shownH = "";
  let wasZoomOk = false;
  let anchored = false;

  const refresh = () => {
    if (!map) return;
    const c = map.getCenter();
    builtAt = { lng: c.lng, lat: c.lat };
    wasZoomOk = map.getZoom() >= HYDRANT_MIN_ZOOM;
    anchored = true;
    const list = nearbyHydrants(map);
    const key = list.map((h) => `${h.lon.toFixed(5)},${h.lat.toFixed(5)}`).join("|");
    if (key === shownH) return;
    shownH = key;
    let k = 0;
    list.forEach((h, i) => {
      const mc = MercatorCoordinate.fromLngLat([h.lon, h.lat], 0);
      p.set((mc.x - origin.x) / s, -(mc.y - origin.y) / s, 0);
      q.setFromAxisAngle(zAxis, (-h.facing * Math.PI) / 180);
      m4.compose(p, q, one);
      bodies.setMatrixAt(i, m4);
      bonnets.setMatrixAt(i, m4);
      for (const [a, z, r, len] of NOZZLES) {
        q.setFromAxisAngle(zAxis, ((-h.facing + a) * Math.PI) / 180);
        off.set(0, 0, z).add(p);
        nozzles.setMatrixAt(k++, m4.compose(off, q, sc.set(len, r, r)));
      }
    });
    bodies.count = bonnets.count = list.length;
    nozzles.count = k;
    for (const mesh of [bodies, bonnets, nozzles]) mesh.instanceMatrix.needsUpdate = true;
    map.triggerRepaint();
  };
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId === "city3d" && e.isSourceLoaded) refresh();
  };
  // jumpTo fires moveend on every walk frame and every look. Scan when the centre moves, or zoom crosses the cutoff.
  const onMove = () => {
    if (!map) return;
    const zoomOk = map.getZoom() >= HYDRANT_MIN_ZOOM;
    if (anchored && zoomOk === wasZoomOk && movedM(map.getCenter(), builtAt) < REBUILD_M) return;
    refresh();
  };

  return {
    id: HYDRANTS_3D_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      m.on("moveend", onMove);
      m.on("sourcedata", onData);
      refresh();
    },
    onRemove(m) {
      m.off("moveend", onMove);
      m.off("sourcedata", onData);
      // The renderer is shared by every three.js layer; never dispose it here.
      renderer = null;
    },
    render(_gl, args) {
      if (!renderer || !map || map.getZoom() < HYDRANT_MIN_ZOOM || bodies.count === 0) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
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
