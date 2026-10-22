/**
 * Sun-driven shadows for the 3D map and street view (one MapLibre custom layer).
 *
 * Buildings are MapLibre fill-extrusions, so this layer rebuilds cheap proxy
 * meshes of the buildings, trees and vehicles around the view target: they cast
 * into one DirectionalLight shadow map (PCF soft) and draw only the shadow
 * itself (ShadowMaterial) on the ground and on the buildings, depth-tested
 * against MapLibre's extrusions. Everything else keeps MapLibre's own lighting,
 * which doubles as the ambient fill, so the shaded side never goes black.
 * The light follows the real NYC sun (suncalc, `?time=` override, see sun.ts).
 * Renders through the shared three.js renderer (threeLayer.sharedRenderer).
 */
import * as THREE from "three";
import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MapLibreMap } from "maplibre-gl";
import { getAmbient } from "@/lib/ambient";
import { sharedRenderer } from "../threeLayer";
import { getShadowCasters, getShadows, lowEnd, sunDate, sunLight } from "./sun";

const { MercatorCoordinate } = maplibregl;
export const SHADOWS_LAYER = "three-shadows";
/** Below this there are no 3D buildings to shade. */
const SHADOWS_MIN_ZOOM = 14.5;
const MAX_RADIUS_M = 700;
const MIN_RADIUS_M = 60;
/** Darkest a shadow gets on a clear day; MapLibre's ambient light shows through the rest. */
const MAX_OPACITY = 0.42;

type Ring = number[][];
type Extrude = { rings: Ring[]; base: number; top: number };

/** Visible radius around the centre, metres (ground distance to the farthest on-ground corner). */
function visibleRadius(map: MapLibreMap): number {
  const c = map.getCenter();
  const { clientWidth: w, clientHeight: h } = map.getCanvas();
  let r = 0;
  // Top corners at high pitch look at the horizon: sample a bit below them too.
  for (const [x, y] of [[0, h], [w, h], [0, h * 0.35], [w, h * 0.35], [w / 2, h * 0.2]]) {
    const p = map.unproject([x, y]);
    r = Math.max(r, c.distanceTo(p));
  }
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, r));
}

function buildingSources(map: MapLibreMap): Array<{ source: string; sourceLayer: string; h: string; base: string }> {
  const out: Array<{ source: string; sourceLayer: string; h: string; base: string }> = [];
  if (map.getSource("city3d")) out.push({ source: "city3d", sourceLayer: "buildings", h: "h", base: "base" });
  for (const l of map.getStyle().layers ?? []) {
    const sl = (l as { "source-layer"?: string })["source-layer"];
    const src = (l as { source?: string }).source;
    if (l.type === "fill-extrusion" && sl === "building" && src && !out.some((o) => o.source === src)) {
      out.push({ source: src, sourceLayer: sl, h: "render_height", base: "render_min_height" });
    }
  }
  return out;
}

export function createShadowLayer(): CustomLayerInterface {
  let map: MapLibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const size = lowEnd() ? 1024 : 2048;

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.bias = -0.0004;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 6000;
  scene.add(sun, sun.target);

  // ShadowMaterial draws only where shadow falls; depth-tested against MapLibre's extrusions.
  // A depth-only pass of the proxies resolves visibility first, then the shadow
  // pass draws on the nearest surface only (LessEqual on the same geometry).
  // The proxies sit on MapLibre's own extrusions, so their depth is the same
  // surface: it stays valid for the layers drawn after this one.
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const receive = new THREE.ShadowMaterial({ transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const groundMat = new THREE.ShadowMaterial({ transparent: true, depthWrite: false });
  // Trees and vehicles already have their own look; they only cast.
  const castOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  ground.renderOrder = 1;
  scene.add(ground);

  let buildings: THREE.Mesh | null = null;
  let occluder: THREE.Mesh | null = null;
  let props: THREE.Mesh | null = null;
  const vehicles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), castOnly, 400);
  vehicles.castShadow = true;
  vehicles.frustumCulled = false;
  vehicles.count = 0;
  scene.add(vehicles);

  let origin = MercatorCoordinate.fromLngLat([-73.984, 40.7549], 0);
  let s = origin.meterInMercatorCoordinateUnits();
  let builtFor = "";

  const local = (lon: number, lat: number): [number, number] => {
    const m = MercatorCoordinate.fromLngLat([lon, lat], 0);
    return [(m.x - origin.x) / s, (m.y - origin.y) / s];
  };

  /** Merged, flat-shaded prism geometry (walls + roof) for a set of footprints. */
  const extrude = (items: Extrude[]): THREE.BufferGeometry => {
    const pos: number[] = [];
    const push = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
    for (const { rings, base, top } of items) {
      const loops = rings.map((r) => r.map(([lon, lat]) => local(lon, lat)));
      for (const loop of loops) {
        for (let i = 0; i + 1 < loop.length; i++) {
          const [x0, z0] = loop[i], [x1, z1] = loop[i + 1];
          push([x0, base, z0], [x1, base, z1], [x1, top, z1]);
          push([x0, base, z0], [x1, top, z1], [x0, top, z0]);
        }
      }
      const outer = loops[0].slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z));
      const holes = loops.slice(1).map((l) => l.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z)));
      if (outer.length < 3) continue;
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) {
        const all = [...outer, ...holes.flat()];
        push([all[a].x, top, all[a].y], [all[b].x, top, all[b].y], [all[c].x, top, all[c].y]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };

  const collect = (source: string, sourceLayer: string, hKey: string, baseKey: string, radius: number, seen: Set<string>): Extrude[] => {
    if (!map) return [];
    const out: Extrude[] = [];
    let feats: ReturnType<MapLibreMap["querySourceFeatures"]> = [];
    try {
      feats = map.querySourceFeatures(source, { sourceLayer });
    } catch {
      return out;
    }
    for (const f of feats) {
      const g = f.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      const p = f.properties as Record<string, number>;
      const top = Number(p[hKey] ?? p.height ?? 0);
      if (!(top > 0.5)) continue;
      const base = Math.max(0, Number(p[baseKey] ?? 0) || 0);
      for (const rings of polys) {
        const [x, z] = local(rings[0][0][0], rings[0][0][1]);
        if (Math.hypot(x, z) > radius * 1.2) continue;
        // Tiles repeat features across their edges: keep one copy.
        const key = `${rings[0][0][0].toFixed(6)},${rings[0][0][1].toFixed(6)},${top}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ rings: rings as Ring[], base, top });
      }
    }
    return out;
  };

  const rebuild = () => {
    if (!map || map.getZoom() < SHADOWS_MIN_ZOOM || !getShadows()) return;
    const c = map.getCenter();
    const radius = visibleRadius(map);
    const key = `${c.lng.toFixed(4)},${c.lat.toFixed(4)},${Math.round(radius / 25)}`;
    if (key === builtFor) return;
    builtFor = key;
    origin = MercatorCoordinate.fromLngLat(c, 0);
    s = origin.meterInMercatorCoordinateUnits();
    const seen = new Set<string>();
    const b: Extrude[] = [];
    for (const src of buildingSources(map)) {
      b.push(...collect(src.source, src.sourceLayer, src.h, src.base, radius, seen));
      if (src.source === "city3d" && b.length) break; // textured city wins over the basemap
    }
    const t = map.getSource("city3d") ? collect("city3d", "props", "height", "base", Math.min(radius, 350), seen) : [];
    for (const old of [buildings, props]) if (old) { scene.remove(old); old.geometry.dispose(); }
    if (occluder) scene.remove(occluder);
    const geo = extrude(b);
    occluder = new THREE.Mesh(geo, depthOnly);
    occluder.frustumCulled = false;
    occluder.renderOrder = 0;
    buildings = new THREE.Mesh(geo, receive);
    buildings.castShadow = buildings.receiveShadow = true;
    buildings.frustumCulled = false;
    buildings.renderOrder = 2;
    props = new THREE.Mesh(extrude(t), castOnly);
    props.castShadow = true;
    props.frustumCulled = false;
    scene.add(occluder, buildings, props);
    map.triggerRepaint();
  };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const syncVehicles = () => {
    const list = getShadowCasters();
    let n = 0;
    for (const v of list) {
      if (n >= 400) break;
      const [x, z] = local(v.lon, v.lat);
      if (Math.hypot(x, z) > MAX_RADIUS_M) continue;
      q.setFromAxisAngle(yAxis, (-v.bearing * Math.PI) / 180);
      m4.compose(p.set(x, v.z, z), q, sc.set(v.width, v.height, v.length));
      vehicles.setMatrixAt(n++, m4);
    }
    vehicles.count = n;
    vehicles.instanceMatrix.needsUpdate = true;
  };

  const onMove = () => rebuild();
  const onData = (e: { isSourceLoaded?: boolean }) => {
    if (e.isSourceLoaded) {
      builtFor = "";
      rebuild();
    }
  };

  return {
    id: SHADOWS_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      m.on("moveend", onMove);
      m.on("sourcedata", onData);
      rebuild();
    },
    onRemove(m) {
      m.off("moveend", onMove);
      m.off("sourcedata", onData);
      for (const o of [buildings, props]) o?.geometry.dispose();
      sun.shadow.map?.dispose();
      renderer = null;
      map = null;
    },
    render(_gl, args: CustomRenderMethodInput) {
      if (!renderer || !map || !buildings || !getShadows() || map.getZoom() < SHADOWS_MIN_ZOOM) return;
      const light = sunLight(sunDate(), getAmbient().weather);
      if (light.strength < 0.01) return; // below the horizon: the night look stays as it is
      // Frustum follows the view target, sized to what is on screen.
      const c = map.getCenter();
      const radius = visibleRadius(map);
      const [cx, cz] = local(c.lng, c.lat);
      const [dx, dy, dz] = light.dir;
      sun.target.position.set(cx, 0, cz);
      sun.position.set(cx + dx * 3000, dy * 3000, cz + dz * 3000);
      const cam = sun.shadow.camera;
      if (cam.right !== radius) {
        cam.left = cam.bottom = -radius;
        cam.right = cam.top = radius;
        cam.updateProjectionMatrix();
      }
      // Normal offset of ~1.5 texels kills acne without visible peter-panning.
      sun.shadow.normalBias = (1.5 * 2 * radius) / size;
      // Soft penumbra under cloud; crisper in sun.
      sun.shadow.radius = light.strength > 0.8 ? 2 : 4;
      ground.position.set(cx, 0.05, cz);
      ground.scale.set(radius * 1.3, 1, radius * 1.3);
      // Shadow tint: cooler and lighter at golden hour (the sky fills more).
      const [r, g, b] = light.color;
      const tint = new THREE.Color(0.04, 0.05 + 0.03 * (1 - g), 0.1 + 0.12 * (1 - b));
      for (const mat of [receive, groundMat]) {
        mat.color.copy(tint);
        mat.opacity = MAX_OPACITY * light.strength;
      }
      sun.color.setRGB(r, g, b);
      syncVehicles();
      const toMerc = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new THREE.Vector3(s, s, s))
        .multiply(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(toMerc);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}
