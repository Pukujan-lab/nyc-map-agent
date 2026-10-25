/*
 * Offline help for underground stations (issue #373). Hand-written, no build
 * step, registered by src/features/underground only while that flag is on.
 *
 * What it keeps: the app shell (the page and its built JS/CSS) and the static
 * transit files (stations and entrances, the MTA elevator/escalator list).
 * No station layouts. What it never keeps:
 * /api/* (the assistant, live arrivals, alerts) and anything on another
 * origin (basemap tiles, live feeds). Live data is never served from here as
 * if it were fresh; the page labels anything it saved itself with its age.
 */
const VERSION = "uw-1";
const CACHE = `nyc-map-offline-${VERSION}`;
/** Filled by the page (src/features/underground/offline.ts), small: one station area at a time. */
const TILE_CACHE = "nyc-map-tiles-v1";
/** Fetched at install so the first offline open works. */
const PRECACHE = ["/", "/favicon.svg", "/transit/subway.json", "/transit/equipment.json"];
/** A slow station signal should not hold the page hostage: fall back to the saved copy. */
const NAV_TIMEOUT_MS = 3500;

/**
 * How one request is answered. "bypass" leaves it to the browser (never cached).
 * @param {URL} url
 * @param {{ mode?: string, method?: string, origin: string }} req
 */
function strategyFor(url, req) {
  if ((req.method ?? "GET") !== "GET") return "bypass";
  // Other hosts (basemap tiles, fonts): always the network; only when that fails, a copy
  // the underground helper saved for a station area. This worker never saves them itself.
  if (url.origin !== req.origin) return "network-then-tiles";
  if (url.pathname.startsWith("/api/") || url.pathname === "/api") return "bypass";
  if (url.pathname === "/sw.js") return "bypass";
  if (req.mode === "navigate") return "network-first-shell";
  // Vite's hashed build output never changes under the same name.
  if (url.pathname.startsWith("/assets/")) return "cache-first";
  // Rebuilt daily: fresh when online, the saved copy when not.
  if (/^\/transit\/[a-z]+\.json$/.test(url.pathname)) return "network-first";
  if (url.pathname === "/favicon.svg") return "cache-first";
  return "bypass";
}

self.UW = { VERSION, CACHE, TILE_CACHE, PRECACHE, strategyFor };

async function put(req, res) {
  if (!res || !res.ok || res.type === "opaque") return res;
  const cache = await caches.open(CACHE);
  await cache.put(req, res.clone());
  return res;
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function networkFirst(request, cacheKey, ms) {
  try {
    const net = fetch(request).then((res) => put(cacheKey, res));
    net.catch(() => undefined); // a late failure after the timeout is not an error
    return await (ms ? Promise.race([net, timeout(ms)]) : net);
  } catch (err) {
    const hit = await caches.match(cacheKey);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  return put(request, await fetch(request));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("nyc-map-offline-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const how = strategyFor(url, { mode: req.mode, method: req.method, origin: self.location.origin });
  if (how === "bypass") return;
  if (how === "network-then-tiles") {
    event.respondWith(
      fetch(req).catch(async (err) => {
        const hit = await caches.open(TILE_CACHE).then((c) => c.match(req.url));
        if (hit) return hit;
        throw err;
      }),
    );
    return;
  }
  if (how === "network-first-shell") event.respondWith(networkFirst(req, "/", NAV_TIMEOUT_MS));
  else if (how === "network-first") event.respondWith(networkFirst(req, req, 0));
  else event.respondWith(cacheFirst(req));
});

/** The page sends the JS/CSS it already loaded before this worker took control. */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "warm" || !Array.isArray(data.urls)) return;
  const origin = self.location.origin;
  const keep = data.urls.filter((u) => {
    try {
      const url = new URL(u, origin);
      return strategyFor(url, { mode: "no-cors", method: "GET", origin }) === "cache-first";
    } catch {
      return false;
    }
  });
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(keep.map((u) => c.add(u).catch(() => undefined)))));
});
