/**
 * Browser plumbing for the underground helper: the offline service worker
 * (public/sw.js), street names and landmarks read from the loaded map while
 * online, and the compass (used only for the optional platform calibration and
 * as a last resort that must agree with a trusted heading).
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { LANDMARKS } from "@/lib/map/landmarks";
import { streetPosition, type NamedLine } from "@/lib/map/streetPos";
import { formatStreetName } from "@/lib/streetName";
import { cornerOf, metres, type ExitPlace, type LandmarkCandidate, type Pt } from "./exits";
import { packTileUrls } from "./tiles";

/**
 * Register public/sw.js (production builds only: Vite's dev server serves
 * modules a worker must not pin). Then hand it the JS/CSS this page already
 * loaded, since those requests happened before the worker was in control.
 */
export function registerOfflineWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      const urls = new Set<string>();
      for (const e of performance.getEntriesByType("resource")) urls.add(e.name);
      document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => urls.add(s.src));
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[rel="modulepreload"]').forEach((l) => urls.add(l.href));
      reg.active?.postMessage({ type: "warm", urls: [...urls] });
    })
    .catch(() => {
      /* no worker (private mode, unsupported): the helper still saves its own copy */
    });
}

/** Basemap points that are not something to look for from the sidewalk. */
const SKIP_POI = new Set(["railway", "bus", "telephone", "recycling", "bicycle_rental", "parking", "bicycle_parking", "toilets", "drinking_water", "atm", "entrance"]);

const STREET_CLASSES = new Set(["minor", "service", "tertiary", "secondary", "primary", "trunk", "pedestrian", "living_street"]);

/** The segment of a named street nearest `at`. */
function nearestSeg(lines: NamedLine[], name: string, at: Pt): [Pt, Pt] | null {
  let best: { s: [Pt, Pt]; d: number } | null = null;
  for (const l of lines) {
    if (l.name !== name) continue;
    for (let i = 1; i < l.coords.length; i++) {
      const s: [Pt, Pt] = [l.coords[i - 1], l.coords[i]];
      const mid: Pt = [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2];
      const d = Math.min(metres(s[0], at), metres(s[1], at), metres(mid, at));
      if (!best || d < best.d) best = { s, d };
    }
  }
  return best?.s ?? null;
}

/**
 * Where two named streets meet near `at`: the crossing of their nearest
 * segments, extended (tile lines are simplified and often stop short).
 */
export function meetPoint(lines: NamedLine[], a: string, b: string, at: Pt): Pt | null {
  const s1 = nearestSeg(lines, a, at);
  const s2 = nearestSeg(lines, b, at);
  if (!s1 || !s2) return null;
  const [[x1, y1], [x2, y2]] = s1;
  const [[x3, y3], [x4, y4]] = s2;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-14) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const p: Pt = [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  return metres(p, at) <= 120 ? p : null;
}

/**
 * What the map knows about each exit's spot, from the tiles loaded now:
 * the two nearest street names, which corner, and nearby landmarks and
 * storefronts. Offline (no tiles) everything comes back empty except the
 * fixed landmark list. `pois` also takes the basemap's named shops and
 * places, for the Top view where the 3D storefronts are not loaded.
 */
export function readMap(map: MapLibreMap | null, opts: { pois?: boolean } = {}): { placeAt: (at: Pt) => ExitPlace; lines: NamedLine[] } {
  const lines: NamedLine[] = [];
  const shops: LandmarkCandidate[] = [];
  if (map?.getSource("openmaptiles")) {
    for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation_name" })) {
      const p = f.properties ?? {};
      if (!STREET_CLASSES.has(String(p.class)) || p.brunnel === "tunnel") continue;
      const name = String(p["name:en"] ?? p.name ?? "");
      if (!name) continue;
      const g = f.geometry;
      if (g.type === "LineString") lines.push({ name, coords: g.coordinates as Pt[] });
      else if (g.type === "MultiLineString") for (const c of g.coordinates) lines.push({ name, coords: c as Pt[] });
    }
  }
  if (map?.getSource("city3d")) {
    for (const f of map.querySourceFeatures("city3d", { sourceLayer: "storefronts" })) {
      const name = (f.properties as { name?: string } | null)?.name;
      if (f.geometry.type === "Point" && name) shops.push({ name, at: f.geometry.coordinates as Pt, tall: false });
    }
  }
  if (opts.pois && !shops.length && map?.getSource("openmaptiles")) {
    for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "poi" })) {
      const p = f.properties ?? {};
      const name = String(p["name:en"] ?? p.name ?? "");
      if (name && f.geometry.type === "Point" && !SKIP_POI.has(String(p.class))) shops.push({ name, at: f.geometry.coordinates as Pt, tall: false });
    }
  }
  const tall: LandmarkCandidate[] = LANDMARKS.map((l) => ({ name: l.name, at: [l.lon, l.lat], tall: true }));
  const placeAt = (at: Pt): ExitPlace => {
    const pos = lines.length ? streetPosition(lines, at[0], at[1], 45, 70) : null;
    // streetPosition formats names; find the raw names again for the meeting point.
    const raw = pos ? [...new Set(lines.map((l) => l.name))].filter((n) => formatStreetName(n) === pos.street || formatStreetName(n) === pos.cross) : [];
    const meet = pos?.cross && raw.length >= 2 ? meetPoint(lines, raw[0], raw[1], at) : null;
    return {
      streets: pos ? (pos.cross ? [pos.street, pos.cross] : [pos.street]) : null,
      corner: meet ? cornerOf(meet, at) : null,
      landmarks: [...tall.filter((l) => metres(l.at, at) <= 900), ...shops.filter((s) => metres(s.at, at) <= 60).slice(0, 12)],
    };
  };
  return { placeAt, lines };
}

/**
 * A real request, because navigator.onLine is often wrong underground and on
 * captive Wi-Fi. The service worker never answers /api/*, so this hits the network.
 */
export async function probe<T = unknown>(url = "/api/transit/alerts", ms = 6000): Promise<{ ok: boolean; body: T | null }> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    return { ok: res.ok, body: res.ok ? ((await res.json()) as T) : null };
  } catch {
    return { ok: false, body: null };
  }
}

/** Cache name shared with public/sw.js, which falls back to it for basemap requests that fail. */
export const TILE_CACHE = "nyc-map-tiles-v1";

/**
 * Save the basemap pieces an offline map of this station needs: the vector
 * tiles around the station and its exits, plus the style, tile index, fonts
 * and icons the page already loaded from the basemap host. Returns the bytes
 * stored for this station's tiles (to report the pack size), or null when it
 * could not (no Cache API, map not ready, offline).
 */
export async function cacheStationTiles(map: MapLibreMap | null, points: Pt[]): Promise<{ bytes: number; tiles: number } | null> {
  if (!map || typeof caches === "undefined") return null;
  const src = map.getSource("openmaptiles") as unknown as { tiles?: string[]; maxzoom?: number; url?: string } | undefined;
  if (!src?.tiles?.length) return null;
  const urls = packTileUrls(src.tiles, points, src.maxzoom ?? 14);
  const host = new URL(src.tiles[0]).origin;
  const support = new Set<string>();
  for (const e of performance.getEntriesByType("resource")) {
    if (e.name.startsWith(host) && !/\/\d+\/\d+\/\d+\.pbf/.test(e.name)) support.add(e.name);
  }
  try {
    const cache = await caches.open(TILE_CACHE);
    let bytes = 0;
    for (const u of urls) {
      const hit = (await cache.match(u)) ?? (await fetch(u, { mode: "cors" }).then(async (r) => (r.ok ? (await cache.put(u, r.clone()), r) : null)));
      if (hit) bytes += (await hit.clone().blob()).size;
    }
    await Promise.all([...support].map(async (u) => ((await cache.match(u)) ? undefined : cache.add(u).catch(() => undefined))));
    return { bytes, tiles: urls.length };
  } catch {
    return null;
  }
}

type MotionEventCtor = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Motion magnitude (m/s², gravity removed) for the stop detector. Asks
 * permission where required (iOS), so call it from a tap. Null when there is
 * no sensor or permission was refused. Browsers stop these events when the
 * screen locks or the tab is hidden. Samples are never stored or sent.
 */
export async function watchMotion(onSample: (t: number, mag: number) => void): Promise<(() => void) | null> {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return null;
  const Ctor = window.DeviceMotionEvent as unknown as MotionEventCtor;
  try {
    if (typeof Ctor.requestPermission === "function" && (await Ctor.requestPermission()) !== "granted") return null;
  } catch {
    return null;
  }
  const handler = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    const g = e.accelerationIncludingGravity;
    const mag = a && a.x !== null ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : g && g.x !== null ? Math.abs(Math.hypot(g.x ?? 0, g.y ?? 0, g.z ?? 0) - 9.81) : null;
    if (mag !== null && Number.isFinite(mag)) onSample(performance.now() / 1000, mag);
  };
  window.addEventListener("devicemotion", handler);
  return () => window.removeEventListener("devicemotion", handler);
}

type OrientationEventCtor = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Listen for the raw compass heading (0 = north). Asks permission where the
 * browser requires it (iOS), so call it from a tap. Resolves to null when
 * there is no compass or permission was refused, else a stop function.
 */
export async function watchCompass(onHeading: (deg: number | null) => void): Promise<(() => void) | null> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return null;
  const Ctor = window.DeviceOrientationEvent as unknown as OrientationEventCtor;
  try {
    if (typeof Ctor.requestPermission === "function" && (await Ctor.requestPermission()) !== "granted") return null;
  } catch {
    return null;
  }
  const handler = (e: DeviceOrientationEvent) => {
    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    const deg = typeof ios === "number" ? ios : e.absolute && typeof e.alpha === "number" ? 360 - e.alpha : null;
    onHeading(deg !== null && Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : null);
  };
  const type = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  window.addEventListener(type, handler as EventListener);
  return () => window.removeEventListener(type, handler as EventListener);
}
