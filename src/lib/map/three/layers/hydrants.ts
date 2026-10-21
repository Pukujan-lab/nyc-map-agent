/** NYC fire hydrants: instanced procedural models at the city tiles' hydrant points. */
import * as THREE from "three";
import type { CustomLayerInterface, Map as MaplibreMap } from "maplibre-gl";
import { addLights, drawScene, sharedRenderer } from "../context";
import { bearingToZ, frameAt, localMatrix, toLocal } from "../projection";
import { HYDRANT_CAP, HYDRANT_MIN_ZOOM, nearbyHydrants } from "../picking";

export const HYDRANTS_3D_LAYER = "city3d-hydrants";

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
  addLights(scene, new THREE.HemisphereLight(0xffffff, 0x6b6b6b, 1.2), { intensity: 1.1, position: [0.4, -0.6, 1] });
  const frame = frameAt([-73.97, 40.73]);
  const local = localMatrix(frame);

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

  const refresh = () => {
    if (!map) return;
    const list = nearbyHydrants(map);
    let k = 0;
    list.forEach((h, i) => {
      p.set(...toLocal(frame, h.lon, h.lat), 0);
      q.setFromAxisAngle(zAxis, bearingToZ(h.facing));
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

  return {
    id: HYDRANTS_3D_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      m.on("moveend", refresh);
      m.on("sourcedata", onData);
      refresh();
    },
    onRemove(m) {
      m.off("moveend", refresh);
      m.off("sourcedata", onData);
      // The renderer is shared by every three.js layer; never dispose it here.
      renderer = null;
    },
    render(_gl, args) {
      if (!renderer || !map || map.getZoom() < HYDRANT_MIN_ZOOM || bodies.count === 0) return;
      drawScene(renderer, scene, camera, args, local);
    },
  };
}
