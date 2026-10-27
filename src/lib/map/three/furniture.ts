/** Bus stop flags and LinkNYC kiosks at street level. */
import * as THREE from "three";
import { dirOf, onPavement, streetBearingAt, toLocal } from "../signPlacement";
import { busStopsShown, eyeOrCenter, kioskSources, setPickTargets, subscribeBusStops, type PickTarget } from "../streetPick";
import { drawRestroomPictogram } from "../restroomPictogram";
import type { CustomLayerInterface, CustomRenderMethodInput } from "maplibre-gl";
import { MercatorCoordinate, type MapLibreMap, REBUILD_M, movedM, LEGACY_LIGHT, sharedRenderer } from "./core";

/** The walker's eye, not the map centre (see eyeOrCenter). */
const eyeLngLat = eyeOrCenter;

export const FURNITURE_LAYER = "city3d-furniture";
const FURN_MIN_ZOOM = 17;
const BUS_MAX = 24;
const BUS_RADIUS_M = 260;
const BUS_POLE_H = 3.0;
const BUS_PLATE = { w: 0.5, h: 0.78, t: 0.03, z: 2.55 };
const KIOSK_MAX = 24;
const KIOSK_RADIUS_M = 220;
const KIOSK = { w: 1.3, h: 2.7, panel: 1.1 };
const BUS_COLS = 8;
const BUS_ROWS = 3; // 2048 x 1536: 24 portrait slots of 256 x 512
const API = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/$/, "");

interface BusStop { id: string; name: string; lat: number; lon: number; dir: string; routes: string[] }

/** Instanced plane material sampling cell (slot.x, slot.y) of a cols x rows atlas. */
function gridMaterial(tex: THREE.Texture, cols: number, rows: number, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: tex, ...opts });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 slot;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>\nvMapUv = vec2((slot.x + uv.x) / ${cols.toFixed(1)}, 1.0 - (slot.y + 1.0 - uv.y) / ${rows.toFixed(1)});`);
  };
  m.customProgramCacheKey = () => `grid-${cols}x${rows}`;
  return m;
}

/** MTA bus stop flag: white on MTA blue, "BUS" pictogram line, then each route in a white tile. */
function drawBusPlate(g: CanvasRenderingContext2D, slot: number, routes: string[]) {
  const W = 256, H = 512;
  const x = (slot % BUS_COLS) * W, y = Math.floor(slot / BUS_COLS) * H;
  g.fillStyle = "#0039a6";
  g.fillRect(x, y, W, H);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '700 54px "Helvetica Neue", Arial, sans-serif';
  g.fillText("BUS", x + W / 2, y + 48);
  g.fillRect(x + 22, y + 86, W - 44, 4);
  const shown = routes.slice(0, 6);
  const rowH = Math.min(64, (H - 120) / Math.max(1, shown.length));
  shown.forEach((r, i) => {
    const cy = y + 112 + i * rowH + rowH / 2;
    g.fillStyle = "#ffffff";
    g.fillRect(x + 26, cy - rowH / 2 + 5, W - 52, rowH - 10);
    g.fillStyle = "#0039a6";
    let size = Math.min(46, rowH - 16);
    do g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`;
    while (g.measureText(r).width > W - 70 && (size -= 2) > 14);
    g.fillText(r, x + W / 2, cy + 2);
  });
  if (routes.length > shown.length) {
    g.fillStyle = "#ffffff";
    g.font = '600 28px "Helvetica Neue", Arial, sans-serif';
    g.fillText(`+${routes.length - shown.length} more`, x + W / 2, y + H - 22);
  }
}

/**
 * Restroom kiosk panel in the Kresilo palette, built for legibility: ink on
 * ivory, a large pictogram, the access rule in words, chartreuse when anyone
 * may use it, and the wheelchair symbol when the place says it is accessible.
 * Four variants: [anyone, customers] x [plain, wheelchair].
 */
function drawKioskPanels(g: CanvasRenderingContext2D) {
  const S = 512;
  ["anyone", "customers"].forEach((access, ai) => {
    [false, true].forEach((wc, wi) => {
      const x = (ai * 2 + wi) * S;
      g.fillStyle = "#f6f3ea";
      g.fillRect(x, 0, S, S);
      g.fillStyle = "#16161a";
      g.fillRect(x + 10, 10, S - 20, 14);
      g.textAlign = "center";
      g.textBaseline = "middle";
      drawRestroomPictogram(g, x + S / 2, 150, 170, "#16161a");
      g.font = '600 46px "Helvetica Neue", Arial, sans-serif';
      g.fillText("Restroom", x + S / 2, 262);
      const band = access === "anyone";
      g.fillStyle = band ? "#d4f53c" : "#16161a";
      g.fillRect(x + 22, 316, S - 44, 108);
      g.fillStyle = band ? "#16161a" : "#f6f3ea";
      g.font = `800 ${band ? 70 : 56}px "Helvetica Neue", Arial, sans-serif`;
      g.fillText(band ? "Anyone" : "Customers only", x + S / 2, 372, S - 64);
      if (wc) {
        g.fillStyle = "#16161a";
        g.font = '700 64px "Helvetica Neue", Arial, sans-serif';
        g.fillText("\u267F accessible", x + S / 2, 470, S - 60);
      }
    });
  });
}

function wheelchairOf(p: Record<string, unknown>): boolean {
  if (p.wheelchair === true || p.wheelchair === "true") return true;
  const a = typeof p.accessibility === "string" ? p.accessibility : "";
  return /accessible/i.test(a) && !/not|in-?accessible/i.test(a);
}

/**
 * Bus stop pole signs (MTA blue flag with the routes serving the stop, the
 * flag edge-on to the curb so it reads along the sidewalk and to an arriving
 * bus) and restroom kiosks (public restrooms "Anyone", shops and cafés
 * "Customers only"), instanced: 6 draw calls for everything in view.
 */
export function createFurnitureLayer(): CustomLayerInterface {
  let map: MapLibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const busCanvas = document.createElement("canvas");
  busCanvas.width = 256 * BUS_COLS;
  busCanvas.height = 512 * BUS_ROWS;
  const bg = busCanvas.getContext("2d")!;
  const busTex = new THREE.CanvasTexture(busCanvas);
  busTex.colorSpace = THREE.SRGBColorSpace;
  busTex.anisotropy = 8;
  const kioskCanvas = document.createElement("canvas");
  kioskCanvas.width = 2048;
  kioskCanvas.height = 512;
  drawKioskPanels(kioskCanvas.getContext("2d")!);
  const kioskTex = new THREE.CanvasTexture(kioskCanvas);
  kioskTex.colorSpace = THREE.SRGBColorSpace;
  kioskTex.anisotropy = 8;

  const busPoles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.04, 0.05, BUS_POLE_H, 8).rotateX(Math.PI / 2).translate(0, 0, BUS_POLE_H / 2),
    new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.6, roughness: 0.45 }),
    BUS_MAX,
  );
  const busPlates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x0039a6, roughness: 0.5 }), BUS_MAX);
  const busFaceGeo = new THREE.PlaneGeometry(1, 1);
  const busSlot = new THREE.InstancedBufferAttribute(new Float32Array(BUS_MAX * 2 * 2), 2);
  busFaceGeo.setAttribute("slot", busSlot);
  const busFaces = new THREE.InstancedMesh(busFaceGeo, gridMaterial(busTex, BUS_COLS, BUS_ROWS), BUS_MAX * 2);
  const kioskBodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(KIOSK.w, KIOSK.w, KIOSK.h).translate(0, 0, KIOSK.h / 2),
    new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.7 }),
    KIOSK_MAX,
  );
  const kioskFaceGeo = new THREE.PlaneGeometry(1, 1);
  const kioskSlot = new THREE.InstancedBufferAttribute(new Float32Array(KIOSK_MAX * 4 * 2), 2);
  kioskFaceGeo.setAttribute("slot", kioskSlot);
  const kioskFaces = new THREE.InstancedMesh(kioskFaceGeo, gridMaterial(kioskTex, 4, 1), KIOSK_MAX * 4);
  const all = [busPoles, busPlates, busFaces, kioskBodies, kioskFaces];
  for (const m of all) {
    m.frustumCulled = false;
    m.count = 0;
    m.castShadow = m !== busFaces && m !== kioskFaces;
    scene.add(m);
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.1 * LEGACY_LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6 * LEGACY_LIGHT);
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);

  let origin = new MercatorCoordinate(0, 0, 0);
  let meters = 1;
  let eyeAt = { lng: 0, lat: 0 };
  let stops: BusStop[] = [];
  let fetchedAt: { lng: number; lat: number } | null = null;
  let lastCheck = 0;
  let shown = "";
  let unsubStops: (() => void) | null = null;

  const loadStops = (eye: { lng: number; lat: number }) => {
    if (!busStopsShown()) return;
    if (fetchedAt && Math.hypot(...toLocal(eye.lng, eye.lat, fetchedAt)) < 120) return;
    fetchedAt = eye;
    const q = new URLSearchParams({ lat: eye.lat.toFixed(4), lon: eye.lng.toFixed(4) });
    fetch(`${API}/api/transit/bus-stops?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ stops: BusStop[] }>) : { stops: [] }))
      .then((d) => {
        const seen = new Map(stops.map((s) => [s.id, s]));
        for (const s of d.stops ?? []) seen.set(s.id, s);
        stops = [...seen.values()].filter((s) => Math.hypot(...toLocal(s.lon, s.lat, eye)) < 600);
        shown = "";
        build();
      })
      .catch(() => {
        fetchedAt = null;
      });
  };

  const streetLines = (): Array<Array<[number, number]>> => {
    const out: Array<Array<[number, number]>> = [];
    if (!map.getSource("openmaptiles")) return out;
    for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" })) {
      const c = String(f.properties?.class);
      if (!["minor", "tertiary", "secondary", "primary", "trunk", "service"].includes(c)) continue;
      const g = f.geometry;
      if (g.type === "LineString") out.push(g.coordinates as Array<[number, number]>);
      else if (g.type === "MultiLineString") out.push(...(g.coordinates as Array<Array<[number, number]>>));
    }
    return out;
  };

  // Restroom points come from data, not rendered tiles: at street level the 2D
  // icon layers are hidden, so their tiles never load. Public restrooms use the
  // city-wide list, like the mini map and its "Nearest restroom" pill, so the
  // kiosk stands there even when the overhead Restrooms switch is off.
  let kioskData: Array<{ kind: PickTarget["kind"]; f: GeoJSON.Feature }> = [];
  let kioskStamp = "";
  const loadKiosks = () => {
    const places = kioskSources.places ? (map.getSource("place-toilets") as unknown as { getData?: () => Promise<GeoJSON.GeoJSON> } | undefined) : undefined;
    void Promise.all([
      import("../restrooms").then((mod) => mod.loadRestrooms()).catch(() => null),
      places?.getData?.().catch(() => null) ?? null,
    ]).then(([city, shops]) => {
      const next: typeof kioskData = [];
      for (const [kind, d] of [["restroom", city], ["place", shops]] as const) {
        if (d?.type === "FeatureCollection") for (const f of d.features) next.push({ kind, f });
      }
      const stamp = next
        .map(({ kind, f }) => {
          const g = f.geometry;
          const at = g?.type === "Point" ? (g.coordinates as [number, number]).map((n) => n.toFixed(5)).join(",") : "";
          return `${kind}:${at}`;
        })
        .join("|");
      kioskData = next;
      if (stamp !== kioskStamp) {
        kioskStamp = stamp;
        shown = "";
        build();
      }
    });
  };

  const kiosks = (eye: { lng: number; lat: number }): PickTarget[] => {
    const out: Array<PickTarget & { d: number }> = [];
    for (const { kind, f } of kioskData) {
      if (f.geometry?.type !== "Point") continue;
      if (kind === "place" && !kioskSources.places) continue;
      const [lng, lat] = f.geometry.coordinates;
      const d = Math.hypot(...toLocal(lng, lat, eye));
      if (d > KIOSK_RADIUS_M) continue;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const raw = props.id ?? props.name;
      const id = typeof raw === "string" || typeof raw === "number" ? String(raw) : `${lng},${lat}`;
      if (out.some((o) => o.kind === kind && o.id === id)) continue;
      out.push({ kind, id, lng, lat, h: KIOSK.h, props, d });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, KIOSK_MAX);
  };

  const build = () => {
    if (!map || map.getZoom() < FURN_MIN_ZOOM) {
      for (const m of all) m.count = 0;
      setPickTargets([]);
      return;
    }
    const eye = eyeLngLat(map);
    const showBus = busStopsShown();
    const near = showBus
      ? stops
        .map((s) => ({ s, d: Math.hypot(...toLocal(s.lon, s.lat, eye)) }))
        .filter((x) => x.d < BUS_RADIUS_M)
        .sort((a, b) => a.d - b.d)
        .slice(0, BUS_MAX)
        .map((x) => x.s)
      : [];
    const found = kiosks(eye);
    const key = `${showBus ? 1 : 0}|` + near.map((s) => s.id).join(",") + "|" + found.map((k) => k.id).join(",") + `|${eye.lng.toFixed(4)},${eye.lat.toFixed(4)}`;
    if (key === shown) return;
    shown = key;
    eyeAt = eye;
    origin = MercatorCoordinate.fromLngLat(eye, 0);
    meters = origin.meterInMercatorCoordinateUnits();
    const m = new THREE.Matrix4();
    const Z = new THREE.Vector3(0, 0, 1);
    const lines = near.length || found.length ? streetLines() : [];
    // The city's point is often inside the building; stand the kiosk on the pavement in front.
    const ks = found.map((k) => {
      const [lng, lat] = onPavement(lines, k.lng, k.lat);
      return { ...k, lng, lat };
    });
    bg.clearRect(0, 0, busCanvas.width, busCanvas.height);
    let nf = 0;
    near.forEach((s, i) => {
      drawBusPlate(bg, i, s.routes);
      const [x, y] = toLocal(s.lon, s.lat, eye);
      const brg = streetBearingAt(lines, s.lon, s.lat, 40) ?? 0;
      const [ux, uy] = dirOf(brg);
      const u = new THREE.Vector3(ux, uy, 0); // along the street: the plate faces along it
      const n = new THREE.Vector3(uy, -ux, 0); // across the street: the plate's width
      m.makeTranslation(x, y, 0);
      busPoles.setMatrixAt(i, m);
      // The flag hangs off the pole toward the roadway side.
      const c = new THREE.Vector3(x, y, BUS_PLATE.z).addScaledVector(n, BUS_PLATE.w / 2 + 0.04);
      m.makeBasis(n.clone().multiplyScalar(BUS_PLATE.w), u.clone().multiplyScalar(BUS_PLATE.t), Z.clone().multiplyScalar(BUS_PLATE.h)).setPosition(c);
      busPlates.setMatrixAt(i, m);
      for (const side of [1, -1]) {
        const nn = u.clone().multiplyScalar(side);
        const right = new THREE.Vector3().crossVectors(Z, nn);
        m.makeBasis(right.multiplyScalar(BUS_PLATE.w * 0.96), Z.clone().multiplyScalar(BUS_PLATE.h * 0.97), nn)
          .setPosition(c.clone().addScaledVector(nn, BUS_PLATE.t / 2 + 0.004));
        busFaces.setMatrixAt(nf, m);
        busSlot.setXY(nf++, i % BUS_COLS, Math.floor(i / BUS_COLS));
      }
    });
    busPoles.count = near.length;
    busPlates.count = near.length;
    busFaces.count = nf;
    let kf = 0;
    ks.forEach((k, i) => {
      const [x, y] = toLocal(k.lng, k.lat, eye);
      m.makeTranslation(x, y, 0);
      kioskBodies.setMatrixAt(i, m);
      const access = k.kind === "restroom" ? 0 : String(k.props.access) === "anyone" ? 0 : 1;
      const variant = access * 2 + (wheelchairOf(k.props) ? 1 : 0);
      for (let f = 0; f < 4; f++) {
        const a = (f * Math.PI) / 2;
        const nn = new THREE.Vector3(Math.sin(a), Math.cos(a), 0);
        const right = new THREE.Vector3().crossVectors(Z, nn);
        m.makeBasis(right.multiplyScalar(KIOSK.panel * 0.94), Z.clone().multiplyScalar(KIOSK.panel * 0.94), nn)
          .setPosition(x + nn.x * (KIOSK.w / 2 + 0.005), y + nn.y * (KIOSK.w / 2 + 0.005), KIOSK.h - KIOSK.panel / 2 - 0.08);
        kioskFaces.setMatrixAt(kf, m);
        kioskSlot.setXY(kf++, variant, 0);
      }
    });
    kioskBodies.count = ks.length;
    kioskFaces.count = kf;
    setPickTargets([
      ...ks.map(({ kind, id, lng, lat, h, props }) => ({ kind, id, lng, lat, h, props })),
      // The sign is the tap target: its next buses (owner, 2026-10-27).
      ...near.map((s) => ({ kind: "busstop" as const, id: s.id, lng: s.lon, lat: s.lat, h: BUS_PLATE.z + BUS_PLATE.h / 2, props: { name: s.name, routes: s.routes } })),
    ]);
    for (const x of all) x.instanceMatrix.needsUpdate = true;
    busSlot.needsUpdate = true;
    kioskSlot.needsUpdate = true;
    busTex.needsUpdate = true;
    map.triggerRepaint();
  };

  const refresh = () => {
    if (!map || map.getZoom() < FURN_MIN_ZOOM) {
      if (shown || busPoles.count || kioskBodies.count) {
        shown = "";
        build();
      }
      return;
    }
    const eye = eyeLngLat(map);
    eyeAt = eye;
    loadStops(eye);
    loadKiosks();
    build();
  };
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId === "restrooms" || e.sourceId === "place-toilets") loadKiosks();
  };
  // jumpTo fires moveend every frame. Kiosks depend on the eye, not the bearing.
  const onMove = () => {
    if (!map) return;
    if (map.getZoom() < FURN_MIN_ZOOM) {
      refresh();
      return;
    }
    if (shown && movedM(eyeLngLat(map), eyeAt) < REBUILD_M) return;
    refresh();
  };

  return {
    id: FURNITURE_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(mp, gl) {
      map = mp;
      renderer = sharedRenderer(mp, gl);
      mp.on("moveend", onMove);
      mp.on("sourcedata", onData);
      unsubStops?.();
      unsubStops = subscribeBusStops(() => {
        shown = "";
        refresh();
      });
      refresh();
    },
    onRemove(mp) {
      mp.off("moveend", onMove);
      mp.off("sourcedata", onData);
      unsubStops?.();
      unsubStops = null;
      setPickTargets([]);
      for (const x of all) {
        x.geometry.dispose();
        (x.material as THREE.Material).dispose();
      }
      busTex.dispose();
      kioskTex.dispose();
    },
    render(_gl, args: CustomRenderMethodInput) {
      const now = performance.now();
      if (now - lastCheck > 500) {
        lastCheck = now;
        const e = eyeLngLat(map);
        if (movedM(e, eyeAt) > REBUILD_M) refresh();
      }
      if (map.getZoom() < FURN_MIN_ZOOM || (!busPoles.count && !kioskBodies.count)) return;
      const s = meters;
      const l = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z ?? 0).scale(new THREE.Vector3(s, -s, s));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(l);
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
