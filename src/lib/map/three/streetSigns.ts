/** Corner street-name signs and road-surface names at street level. */
import * as THREE from "three";
import { cornerOffset, crossingsNear, dirOf, toLocal, type NamedStreet } from "../signPlacement";
import { eyeOrCenter } from "../streetPick";
import type { CustomLayerInterface, CustomRenderMethodInput } from "maplibre-gl";
import { MercatorCoordinate, type MapLibreMap, REBUILD_M, movedM, LEGACY_LIGHT, sharedRenderer } from "./core";

export const STREET_SIGNS_LAYER = "city3d-signs";
export const SIGNS_MIN_ZOOM = 17;
const SIGNS_RADIUS_M = 220;
const SIGNS_MAX = 40; // two names each: 80 of the atlas's 84 slots
const POLE_H = 3.7; // NYC sign poles are ~3.5-4 m
// Real blades are ~0.75 x 0.15 m, but at eye level and 30 m away that is a few
// pixels of text: blades are drawn ~1.6x larger so names stay readable.
const BLADE_W = 1.25;
const BLADE_H = 0.26;
const BLADE_T = 0.03;
const BLADE_Z = [POLE_H - 0.42, POLE_H - 0.12]; // street A lower, street B on top, crossed
/** Road-surface name: metres across the street, along it, and back from the crossing. */
const ROAD_W = 7;
const ROAD_H = 3.5;
const ROAD_BACK_M = 14;
// Atlas: 2048 x 2048, 4 columns x 21 rows of 512 x 96 blade faces.
const ATLAS = 2048;
const SLOT_W = 512;
const SLOT_H = 96;
const COLS = ATLAS / SLOT_W;

interface Sign {
  key: string;
  lng: number;
  lat: number;
  a: string;
  b: string;
  ba: number;
  bb: number;
}

/** The walker's eye, not the map centre (see eyeOrCenter). */
const eyeLngLat = eyeOrCenter;

/** Pedestrian-scale road classes whose crossings get a corner sign. */
const SIGN_CLASSES = new Set(["minor", "tertiary", "secondary", "primary", "trunk", "living_street", "residential"]);

/**
 * Corner signs around the eye (not the map centre, which floats down the look
 * ray at eye level), from the crossings of the basemap's named street
 * centrelines (OSM, the same lines the street-view header reads).
 */
function nearbySigns(map: MapLibreMap, eye: { lng: number; lat: number }): Sign[] {
  if (!map.getSource("openmaptiles")) return [];
  const lines: NamedStreet[] = [];
  for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation_name" })) {
    const p = f.properties ?? {};
    if (!SIGN_CLASSES.has(String(p.class)) || p.brunnel === "tunnel" || p.brunnel === "bridge") continue;
    const name = String(p["name:en"] ?? p.name ?? "");
    if (!name) continue;
    const g = f.geometry;
    if (g.type === "LineString") lines.push({ name, coords: g.coordinates as Array<[number, number]> });
    else if (g.type === "MultiLineString") for (const c of g.coordinates) lines.push({ name, coords: c as Array<[number, number]> });
  }
  return crossingsNear(lines, eye, SIGNS_RADIUS_M, SIGNS_MAX).map((c) => ({ ...c, key: `${c.lng.toFixed(5)},${c.lat.toFixed(5)}` }));
}

/** Blade face: white on NYC street-sign green, abbreviated as the real signs are ("Grand St"). */
function drawBlade(g: CanvasRenderingContext2D, slot: number, name: string) {
  const x = (slot % COLS) * SLOT_W;
  const y = Math.floor(slot / COLS) * SLOT_H;
  g.fillStyle = "#0b6b3a";
  g.fillRect(x, y, SLOT_W, SLOT_H);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 4;
  g.strokeRect(x + 6, y + 6, SLOT_W - 12, SLOT_H - 12);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 60;
  do g.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(name).width > SLOT_W - 40 && (size -= 3) > 18);
  g.fillText(name, x + SLOT_W / 2, y + SLOT_H / 2 + 3);
}

/**
 * Street name painted on the asphalt before the crossing, white on clear, in
 * the half-size road atlas. Seen from 1.7 m up, the plane (stretched along the
 * road) foreshortens the letters back to normal proportions, like "STOP".
 */
function drawRoad(g: CanvasRenderingContext2D, slot: number, name: string) {
  const w = SLOT_W / 2;
  const h = SLOT_H / 2;
  const x = (slot % COLS) * w;
  const y = Math.floor(slot / COLS) * h;
  g.fillStyle = "rgba(244,241,232,0.95)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 34;
  do g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(name).width > w - 12 && (size -= 2) > 10);
  g.fillText(name, x + w / 2, y + h / 2 + 2, w - 8);
}

/**
 * Instanced plane material that samples its own atlas slot (blade faces, or
 * road letters on clear). Road letters are an alpha cut-out, not blended:
 * blending inside MapLibre's shared context dropped them entirely.
 */
function slotMaterial(atlas: THREE.Texture, road: boolean): THREE.MeshBasicMaterial {
  const m = road
    ? new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })
    : new THREE.MeshBasicMaterial({ map: atlas, color: 0xe6e6e6 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 slot;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>\nvMapUv = vec2((slot.x + ${road ? "1.0 - uv.x" : "uv.x"}) / ${COLS.toFixed(1)}, 1.0 - (slot.y + 1.0 - uv.y) * ${(SLOT_H / ATLAS).toFixed(6)});`,
      );
  };
  // Road letters flip u: the layer matrix mirrors handedness, which read them backwards.
  m.customProgramCacheKey = () => (road ? "slot-road" : "slot-face");
  return m;
}

export function createStreetSignsLayer(): CustomLayerInterface {
  let map: MapLibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const g = canvas.getContext("2d")!;
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  // Road letters: same slot grid at half resolution, white on clear.
  const roadCanvas = document.createElement("canvas");
  roadCanvas.width = ATLAS / 2;
  roadCanvas.height = ATLAS / 2;
  const rg = roadCanvas.getContext("2d")!;
  const roadAtlas = new THREE.CanvasTexture(roadCanvas);
  roadAtlas.colorSpace = THREE.SRGBColorSpace;
  roadAtlas.anisotropy = 8;

  // One draw call per part, for every sign in view.
  const poleGeo = new THREE.CylinderGeometry(0.045, 0.055, POLE_H, 8).rotateX(Math.PI / 2).translate(0, 0, POLE_H / 2);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2c3530, metalness: 0.5, roughness: 0.55 }), SIGNS_MAX);
  const bladeGeo = new THREE.BoxGeometry(1, 1, 1);
  const blades = new THREE.InstancedMesh(bladeGeo, new THREE.MeshStandardMaterial({ color: 0x0b6b3a, roughness: 0.6 }), SIGNS_MAX * 2);
  const faceGeo = new THREE.PlaneGeometry(1, 1);
  const faceSlot = new THREE.InstancedBufferAttribute(new Float32Array(SIGNS_MAX * 4 * 2), 2);
  faceGeo.setAttribute("slot", faceSlot);
  const faces = new THREE.InstancedMesh(faceGeo, slotMaterial(atlas, false), SIGNS_MAX * 4);
  const roadGeo = new THREE.PlaneGeometry(1, 1);
  const roadSlot = new THREE.InstancedBufferAttribute(new Float32Array(SIGNS_MAX * 4 * 2), 2);
  roadGeo.setAttribute("slot", roadSlot);
  const roads = new THREE.InstancedMesh(roadGeo, slotMaterial(roadAtlas, true), SIGNS_MAX * 4);
  for (const m of [poles, blades, faces, roads]) {
    m.frustumCulled = false;
    m.count = 0;
    // Sun shadows (when on) fall from the pole and blades.
    m.castShadow = m !== roads && m !== faces;
    scene.add(m);
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.1 * LEGACY_LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6 * LEGACY_LIGHT);
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);

  let origin = new MercatorCoordinate(0, 0, 0);
  let meters = 1;
  let shown = "";
  let lastEye = { lng: 0, lat: 0 };
  let lastCheck = 0;
  let dirty = true;

  const refresh = () => {
    if (map.getZoom() < SIGNS_MIN_ZOOM) {
      if (poles.count || shown) {
        for (const m of [poles, blades, faces, roads]) m.count = 0;
        shown = "";
        map.triggerRepaint();
      }
      return;
    }
    const eye = eyeLngLat(map);
    // Anchor before the scan so a look, which does not move the eye, does not scan again.
    lastEye = eye;
    const want = nearbySigns(map, eye);
    const key = want.map((s) => s.key).join("|");
    if (key === shown && !dirty) return;
    shown = key;
    dirty = false;
    origin = MercatorCoordinate.fromLngLat(eye, 0);
    meters = origin.meterInMercatorCoordinateUnits();
    g.clearRect(0, 0, ATLAS, ATLAS);
    rg.clearRect(0, 0, ATLAS / 2, ATLAS / 2);
    const m = new THREE.Matrix4();
    const Z = new THREE.Vector3(0, 0, 1);
    let nb = 0;
    let nf = 0;
    let nr = 0;
    want.forEach((s, i) => {
      const slots = [2 * i, 2 * i + 1];
      drawBlade(g, slots[0], s.a);
      drawBlade(g, slots[1], s.b);
      drawRoad(rg, slots[0], s.a);
      drawRoad(rg, slots[1], s.b);
      const [cx, cy] = toLocal(s.lng, s.lat, eye);
      const [ox, oy] = cornerOffset(s.ba, s.bb);
      const pole = new THREE.Vector3(cx + ox, cy + oy, 0);
      m.makeTranslation(pole.x, pole.y, 0);
      poles.setMatrixAt(i, m);
      [s.ba, s.bb].forEach((brg, k) => {
        const [ux, uy] = dirOf(brg);
        const u = new THREE.Vector3(ux, uy, 0); // along the street: the blade runs parallel to it
        const n = new THREE.Vector3(uy, -ux, 0); // blade face normal
        const z = BLADE_Z[k];
        m.makeBasis(u.clone().multiplyScalar(BLADE_W), n.clone().multiplyScalar(BLADE_T), Z.clone().multiplyScalar(BLADE_H)).setPosition(pole.x, pole.y, z);
        blades.setMatrixAt(nb++, m);
        const slot = slots[k];
        for (const side of [1, -1]) {
          const nn = n.clone().multiplyScalar(side);
          const right = new THREE.Vector3().crossVectors(Z, nn); // reads left-to-right from that side
          m.makeBasis(right.multiplyScalar(BLADE_W * 0.98), Z.clone().multiplyScalar(BLADE_H * 0.96), nn)
            .setPosition(pole.x + nn.x * (BLADE_T / 2 + 0.004), pole.y + nn.y * (BLADE_T / 2 + 0.004), z);
          faces.setMatrixAt(nf, m);
          faceSlot.setXY(nf++, slot % COLS, Math.floor(slot / COLS));
          // Name painted on the asphalt on each approach, reading toward the crossing.
          const look = new THREE.Vector3(-side * ux, -side * uy, 0);
          const r = new THREE.Vector3(look.y, -look.x, 0);
          m.makeBasis(r.multiplyScalar(ROAD_W), look.multiplyScalar(ROAD_H), Z)
            .setPosition(cx + side * ux * ROAD_BACK_M, cy + side * uy * ROAD_BACK_M, 0.05);
          roads.setMatrixAt(nr, m);
          roadSlot.setXY(nr++, slot % COLS, Math.floor(slot / COLS));
        }
      });
    });
    poles.count = want.length;
    blades.count = nb;
    faces.count = nf;
    roads.count = nr;
    for (const x of [poles, blades, faces, roads]) x.instanceMatrix.needsUpdate = true;
    faceSlot.needsUpdate = true;
    roadSlot.needsUpdate = true;
    atlas.needsUpdate = true;
    roadAtlas.needsUpdate = true;
    map.triggerRepaint();
  };
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId === "openmaptiles" && e.isSourceLoaded) {
      dirty = true;
      refresh();
    }
  };
  // jumpTo fires moveend every frame. A look only changes bearing, so skip the street scan until the eye moves.
  const onMove = () => {
    if (!dirty && shown && movedM(eyeLngLat(map), lastEye) < REBUILD_M) return;
    refresh();
  };

  return {
    id: STREET_SIGNS_LAYER,
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
      for (const x of [poles, blades, faces, roads]) {
        x.geometry.dispose();
        (x.material as THREE.Material).dispose();
      }
      atlas.dispose();
      roadAtlas.dispose();
    },
    render(_gl, args: CustomRenderMethodInput) {
      // Backup if the eye moved without a moveend. jumpTo itself does fire moveend.
      const now = performance.now();
      if (now - lastCheck > 400) {
        lastCheck = now;
        if (movedM(eyeLngLat(map), lastEye) > REBUILD_M) {
          dirty = true;
          refresh();
        }
      }
      if (map.getZoom() < SIGNS_MIN_ZOOM || !poles.count) return;
      const s = meters;
      const l = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z ?? 0).scale(new THREE.Vector3(s, -s, s));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}

// ---- Street furniture: bus stop poles and restroom kiosks ----
