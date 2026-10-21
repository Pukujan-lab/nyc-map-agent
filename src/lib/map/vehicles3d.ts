/**
 * Live transit vehicles as real 3D meshes: ONE MapLibre custom layer drawing
 * three.js into the map's own canvas and depth buffer (no second canvas, no
 * deck.gl). Low-poly procedural bodies (a tapered car / bus box), instanced so
 * the whole fleet is two draw calls, tinted per line. Underground trains are
 * translucent "ghosts" drawn without depth test so they read through the
 * ground from above. Loaded lazily the first time the map is tilted.
 */
import * as THREE from "three";
import { MercatorCoordinate, type CustomLayerInterface, type Map as MaplibreMap } from "maplibre-gl";
import { VIADUCT_TOP, type Vehicle } from "@/lib/transit/model";

export const VEHICLES_3D_LAYER = "transit-vehicles-3d";
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
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
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
  function update(vehicles: Vehicle[], walking: boolean) {
    let t = 0, b = 0, g = 0;
    for (const v of vehicles) {
      const ghost = v.grade === "underground";
      if (ghost && walking) continue; // street level shows entrances instead
      const mesh = v.system === "bus" ? buses : ghost ? ghosts : trains;
      const i = v.system === "bus" ? b++ : ghost ? g++ : t++;
      if (i >= CAP) continue;
      const mc = MercatorCoordinate.fromLngLat([v.lon, v.lat], 0);
      p.set((mc.x - origin.x) / s, -(mc.y - origin.y) / s, v.grade === "elevated" ? VIADUCT_TOP : 0);
      q.setFromAxisAngle(zAxis, (-v.bearing * Math.PI) / 180);
      mesh.setMatrixAt(i, m4.compose(p, q, one));
      mesh.setColorAt(i, color.set(v.system === "bus" ? "#f8fafc" : v.color));
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
