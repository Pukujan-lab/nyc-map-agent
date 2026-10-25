# Performance, loading and abuse protection

*Written 2026-10-23 from the owner's conversation. **Decided** means the owner agreed; **proposal** means suggested and not yet confirmed. Numbers come from reading the code; nothing here has been profiled or measured yet.*

## Why this matters
The map makes the owner's computer and phone slow, and the project is open source with no budget for runaway API or model costs. Speed and abuse protection serve the main goal: an agent that is always available and feels light.

## Measure first
Before and after each change, record one phone-size first load: number of requests, bytes transferred, time to first map, and CPU while idle with live trains on. Without this we cannot tell whether a change helped.

## Baseline (2026-10-23)

**The map does a lot of work even when nobody touches it.** With live trains on (the default),
the map redraws about 27–51 times a second and React applies 29–46 updates (commits) a second
while the page sits idle, at every view and both window sizes. The first load downloads about
4 MB of compressed data (22 MB once unpacked) in 58–69 requests. Two crime and noise
summaries from `/api/aggregate` make up 2.6 MB of that, which is more than the 0.5 MB main
script. The JavaScript heap (the memory the page's scripts use) sat between 150 and 420 MB.

These numbers come from a heavily overloaded shared machine with an emulated phone screen.
Treat them as a rough before-picture, not as what the owner's phone does (see
[Caveats](#caveats)). Issue [#362](https://github.com/Pukujan/nyc-map-agent/issues/362) asks for
the owner's own phone and work computer, and nobody has measured those yet.

### What was measured

- **Build.** Production: the deployed site <https://nyc.design-bakery.com>. It serves
  `assets/index-D2LV0Yl2.js` (1,868,873 bytes, last modified 2026-10-23 21:35 UTC). That came
  after `main` commit `24ed8dd` (21:23 UTC). A local `vite build` of `24ed8dd` gives a main
  script of nearly the same size (1,868,500 bytes) but a different file name, so the deploy is
  *probably* `24ed8dd`. This is not proven. Development: `vite` dev server at `24ed8dd`, with
  `/api` passed through to the production site (`API_PROXY_TARGET`).
- **Device.** Apple M1 (8 cores, 8 GB), macOS 26.6. The browser was the Claude desktop app's
  built-in browser (Chrome 152). Its pane was hidden.
- **Viewports.** Phone: 390 × 800 CSS pixels, with the browser pretending to be a Pixel 8
  (Android user agent, 2× pixel density). Wide: 1440 × 900, desktop user agent, 2× density.
  The browser only pretended to be a phone. It did not slow down its CPU or network to match
  one.
- **Views.** *Top* is the start view (citywide, flat). *Tilted* is a click on the app's **Up**
  button. *Street* moves the camera to Times Square (−73.9857, 40.7580) at zoom 16, then clicks
  **Street** in production or calls `window.__walk(...)` in development (where that helper
  exists). The camera each run ended on is in the tables.
- **Live trains.** On (the default with no `?transit=` in the address). Live buses: off.

### Method

1. Open a page on the same origin (`/api/nope`), so a script can reach into a frame of the app.
2. Load the app into a frame of the chosen viewport size. Before the app's scripts run, put a
   stand-in for React's developer-tools hook in that frame. React reports every commit (each
   time it applies a render to the page) to that hook.
3. Find the MapLibre map object (MapLibre draws the map) through React's internal component
   tree. Record when it fires `load` (style ready, first frame) and its first `idle` (all
   tiles drawn, nothing moving). Wait up to 45 s for `idle`.
4. Read the browser's own timing lists for that frame: the page navigation, first contentful
   paint (FCP, the first moment anything appears), and every resource request.
5. Apply the view, then wait 10 s for it to settle.
6. Measure for 60 s without touching anything:
   - frames per second (`requestAnimationFrame` callbacks; the screen caps it at 60);
   - map redraws per second (MapLibre `render` events);
   - long tasks, meaning stretches over 50 ms where the page could not respond
     (`PerformanceObserver('longtask')`);
   - timer lag: how late a 100 ms repeating timer fires, which shows a busy page *or* a busy
     machine;
   - React commits and, in development only, how many of them re-rendered `TransitLayer`
     (production shortens component names, so it cannot be picked out there);
   - JS heap from `performance.memory`, and requests made during the minute.
7. Record the machine's load average from `uptime` every 15 s alongside the runs.

The harness script is in the collapsed block at the end of this section. It changes no app
code.

### First load — production

Each row is one fresh load of the page. The view is applied *after* the first load, so all
rows load the same start view, and the repeats show how much the timing varies.

| Run (time, EDT) | Viewport | Cache | Requests | Bytes over network | Bytes if uncached (compressed) | Unpacked | FCP | Map `load` | First `idle` | Heap after load | Load average (1 min) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 22:00 (first ever) | 390 × 800 | cold | 64 | 3.90 MB | 3.98 MB | 21.4 MB | 0.9 s | 18.8 s | 32.4 s | 360 MB | ~35 |
| 22:03 | 390 × 800 | warm | 65 | 0.12 MB | 3.95 MB | 21.4 MB | 0.3 s | 3.0 s | 10.1 s | 372 MB | 31–44 |
| 22:04 | 390 × 800 | warm | 65 | 0.09 MB | 3.93 MB | 21.5 MB | 0.4 s | 4.9 s | 13.7 s | 356 MB | 40–69 |
| 22:06 | 390 × 800 | warm | 69 | 0.21 MB | 4.09 MB | 22.3 MB | 0.4 s | 7.3 s | 19.1 s | 177 MB | 36–59 |
| 22:10 | 1440 × 900 | mostly cold | 58 | 3.04 MB | 3.85 MB | 20.9 MB | 0.6 s | 54.6 s | none in 45 s | 166 MB | 27–33 |
| 22:12 | 1440 × 900 | mostly cold | 67 | 3.15 MB | 4.12 MB | 22.0 MB | 0.3 s | 4.4 s | 47.5 s | 223 MB | 20–27 |
| 22:14 | 1440 × 900 | warm | 63 | 0.23 MB | 3.98 MB | 21.7 MB | 0.3 s | 49.6 s | 54.6 s | 199 MB | 24–35 |

Times are from the start of the page load. "Bytes if uncached" is the compressed size of
everything the page asked for, so it is comparable between warm and cold runs.

The largest first-load downloads (compressed):

| Request | Size |
|---|---|
| `/api/aggregate?dataset=noise&window=90d` | 1,426 KB |
| `/api/aggregate?dataset=crashes&window=12mo` | 1,215 KB |
| `/assets/index-*.js` (main script) | 540 KB |
| `/transit/subway.json` | 227 KB |
| `/assets/threeLayer-*.js` (3D layer, loaded at start even in Top view) | 165 KB |

The production build (`vite build` of `24ed8dd`) has a 1,869 KB main script (544 KB
gzipped), a 1,051 KB Mapillary chunk (270 KB gzipped; street photos, not loaded at start) and
a 617 KB three.js chunk (162 KB gzipped). The whole build output is 17 MB, most of it 3D models,
textures and tiles fetched only when needed.

### First load — development server

The dev server sends hundreds of small, separate modules, so these numbers describe the
developer's experience, not users'.

| Run (time, EDT) | Viewport | Requests | Bytes if uncached | FCP | Map `load` | First `idle` | Heap after load | Load average |
|---|---|---|---|---|---|---|---|---|
| 22:18 | 1440 × 900 | 221 | 7.7 MB | 13.1 s | 16.8 s | 21.1 s | 81 MB | 85–127 |
| 22:19 | 1440 × 900 | ≥ 250 | 8.4 MB | 1.2 s | 4.0 s | none in 45 s | 102 MB | 44–74 |
| 22:21 | 1440 × 900 | ≥ 250 | 8.4 MB | 9.5 s | 12.0 s | 56.7 s | 292 MB | 32–38 |
| 22:24 | 390 × 800 | ≥ 250 | 8.4 MB | 3.1 s | 6.9 s | 28.6 s | 168 MB | 40–47 |
| 22:26 | 390 × 800 | ≥ 250 | 8.5 MB | 6.1 s | 8.7 s | 41.8 s | 187 MB | 36–64 |
| 22:33 | 390 × 800 | ≥ 250 | 8.4 MB | 2.4 s | 5.7 s | 17.7 s | 316 MB | 23–28 |

"≥ 250": the browser's timing list stops at 250 entries by default. So the real count is
higher, and requests during the idle minute were not recorded in development.

### Idle minute with live trains on

| Build | Viewport | View (zoom, pitch) | Frames/s | Map redraws/s | React commits/min | `TransitLayer` re-renders/min | Long tasks (count / total / longest) | Long-task share | Timer lag avg / max | Heap start → end | Requests in the minute | Load average |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| prod | 390 × 800 | Top (9.9, 0°) | 36.7 | 36.2 | 2,015 | n/a | 9 / 790 ms / 251 ms | 1.3 % | 6.5 / 206 ms | 233 → 224 MB | 10 (434 KB) | 31–44 |
| prod | 390 × 800 | Tilted (17.7, 25°) | 45.1 | 42.1 | 2,336 | n/a | 4 / 996 ms / 396 ms | 1.7 % | 6.4 / 322 ms | 213 → 230 MB | 7 (315 KB) | 40–69 |
| prod | 390 × 800 | Street (22.8, 86°) | 51.1 | 46.4 | 2,773 | n/a | 5 / 1,612 ms / 646 ms | 2.7 % | 6.8 / 605 ms | 206 → 417 MB | 7 (280 KB) | 36–59 |
| prod | 1440 × 900 | Top (11.0, 0°) | 29.0 | 27.1 | 1,753 | n/a | 5 / 368 ms / 107 ms | 0.6 % | 6.0 / 188 ms | 156 → 421 MB | 9 (324 KB) | 27–33 |
| prod | 1440 × 900 | Tilted (17.9, 25°) | 43.4 | 40.7 | 2,465 | n/a | 4 / 414 ms / 154 ms | 0.7 % | 5.2 / 190 ms | 378 → 152 MB | 10 (422 KB) | 20–27 |
| prod | 1440 × 900 | Street (22.9, 86°) | 38.7 | 35.8 | 2,126 | n/a | 2 / 702 ms / 404 ms | 1.1 % | 9.4 / 1,651 ms | 199 → 282 MB | 9 (367 KB) | 24–35 |
| dev | 1440 × 900 | Top (11.0, 0°) | 23.7 | 17.7 | 1,527 | 1,287 | 16 / 5,585 ms / 2,453 ms | 9.3 % | 78 / 2,509 ms | 82 → 163 MB | 4 (231 KB) | 85–127 |
| dev | 1440 × 900 | Tilted (13.4, 62°) | 10.5 | 9.2 | 849 | 847 | 1 / 56 ms / 56 ms | 0.1 % | 106 / 2,353 ms | 155 → 153 MB | not recorded | 44–74 |
| dev | 1440 × 900 | Street (22.9, 86°) | 47.0 | 42.6 | 1,519 | 1,457 | 9 / 794 ms / 244 ms | 1.3 % | 9.2 / 869 ms | 248 → 206 MB | not recorded | 32–38 |
| dev | 390 × 800 | Top (9.9, 0°) | 44.2 | 44.0 | 1,332 | 1,329 | 16 / 1,785 ms / 231 ms | 3.0 % | 7.2 / 305 ms | 235 → 187 MB | not recorded | 40–47 |
| dev | 390 × 800 | Tilted (17.7, 25°) | 40.0 | 37.3 | 1,319 | 1,318 | 22 / 1,846 ms / 252 ms | 3.0 % | 24.5 / 1,110 ms | 290 → 124 MB | not recorded | 36–64 |
| dev | 390 × 800 | Street (22.8, 86°) | 15.3 | 13.9 | 1,117 | 1,056 | 4 / 390 ms / 208 ms | 0.6 % | 189 / 4,979 ms | 284 → 262 MB | not recorded | 23–28 |

What the idle minute shows:

- **The map never rests.** Map redraws per second track frames per second in every row. With
  live trains on, MapLibre redraws whenever the browser can draw a frame, not only when
  something changes. The low rows (10–24 frames/s) have huge timer lag, so they show the
  machine choking, not the map getting lighter.
- **`TransitLayer` re-renders 14–24 times a second**, and that is nearly every React commit
  in development (for example 1,329 of 1,332 in a minute). The train-position animation in
  `src/features/transit/TransitLayer.tsx` calls `setVehicles` every 66 ms from a
  `requestAnimationFrame` loop, so the whole component re-renders each time. Production
  commits 29–46 times a second, more than development. Other components may also re-render
  on a timer there, but this is not confirmed: production shortens component names, so the
  harness cannot tell which ones.
- **Long tasks are rare but long.** Few in a minute, yet single tasks reached 0.4–0.6 s in
  street level and tilted views. That is long enough for a tap to feel ignored.
- **About 7–10 requests a minute** (280–434 KB) keep coming in production while idle. That is
  live-feed polling.
- **The heap swings by 100–270 MB within a minute** with no input, so the page creates a lot
  of short-lived garbage.

### Caveats

- **Not the owner's devices.** This was the shared development Mac with an emulated phone
  screen. It had the Mac's CPU and network, not a phone's. A real phone will be slower.
  Issue #362 still needs runs on the owner's phone and work computer.
- **The machine was badly overloaded.** Load average (programs waiting for one of the 8
  cores) ran 20–127 during the runs, 3–15 times the core count. Other agents and dev servers
  were running. Every timing here, above all the 4–55 s spread in map `load` and the
  10–24 frames/s rows, carries that noise. Compare later results run to run on the same
  machine, at a similar load average.
- **One sample per row**, no averaging. One extra development street-level run was thrown
  away: its camera never reached street level and its timer stalled for 10 s. The rerun is
  the row shown.
- **Development is not production.** The dev server serves unbundled modules, runs React's
  development build and has hot reload. Only the production rows describe users. The
  dev-only `TransitLayer` count also walks React's whole component tree on every commit,
  which adds some cost to the dev rows.
- **Map tiles are under-counted.** MapLibre fetches vector tiles inside background workers,
  and those requests do not appear in the page's timing list. The openfreemap.org entries
  that do appear (style, sprites, fonts) report 0 bytes, because that server does not allow
  timing to be shared with other sites. The real first-load bytes are higher than shown.
- **Hidden browser pane.** The browser pane was hidden, though the page still reported itself
  visible and drew at up to 60 frames/s. A visible window on a real device may schedule
  frames differently.
- **Heap is coarse.** `performance.memory` is a Chrome-only, rounded figure that rises and
  falls with garbage collection. It includes the small harness page.
- **Cache state varied.** Only the first production run started with an empty cache. The
  1440 × 900 runs found most files gone from the cache again. "Bytes if uncached" is the
  column to compare.

<details>
<summary>Harness script (paste into the console of a same-origin page such as <code>/api/nope</code>)</summary>

Usage: `__bench({ src: "/?b=" + Date.now(), w: 390, h: 800, view: "top" | "tilt" | "street", transit: false })`,
then read `window.__result` once `__result.status === "done"` (about 90–120 s). Pass
`transit: true` only against the dev server. Size the browser to the same viewport first.

```js
window.__bench = function (opts) {
  const R = (window.__result = { opts, status: "starting" });
  document.querySelectorAll("iframe").forEach((f) => f.remove());
  document.body.style.margin = "0";
  const fr = document.createElement("iframe");
  fr.style.cssText = `position:absolute;left:0;top:0;width:${opts.w}px;height:${opts.h}px;border:0;background:#fff;z-index:9`;
  document.body.appendChild(fr);
  const ctr = (R.ctr = { commits: 0, transit: 0, longAll: 0, longAllMs: 0, counting: false, winCommits: 0, winTransit: 0, longN: 0, longMs: 0, longMax: 0, frames: 0, renders: 0 });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let w = null, map = null, installed = false;
  const isMap = (o) => o && typeof o === "object" && typeof o.getStyle === "function" && typeof o.loaded === "function" && typeof o.on === "function";
  const check = (o) => {
    if (!o || typeof o !== "object") return null;
    if (isMap(o)) return o;
    if (isMap(o.map)) return o.map;
    if (isMap(o._map)) return o._map;
    if (typeof o.getMap === "function") { try { const m = o.getMap(); if (isMap(m)) return m; } catch (e) {} }
    return null;
  };
  // The map object, found through React's component tree (production does not expose window.__map).
  const findMap = () => {
    if (w.__map && isMap(w.__map)) return w.__map;
    const el = w.document && w.document.querySelector(".maplibregl-map");
    if (!el) return null;
    const k = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    let f = k && el[k];
    for (let i = 0; f && i < 25; i++, f = f.return) {
      let s = f.memoizedState;
      for (let j = 0; s && j < 60; j++, s = s.next) {
        const v = s.memoizedState;
        const m = check(v) || check(v && v.current) || (Array.isArray(v) && check(v[0]));
        if (m) return m;
      }
    }
    return null;
  };
  // Stand-in React DevTools hook, installed before the app's modules run: counts commits,
  // and (opts.transit) TransitLayer re-renders (a new fiber that performed work).
  const install = () => {
    installed = true;
    R.hookAt = w.performance.now();
    R.hookBeforeReact = !w.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    let lastTL = null;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(), isDisabled: false,
      inject() { return 1; }, checkDCE() {}, onScheduleFiberRoot() {}, onPostCommitFiberRoot() {}, onCommitFiberUnmount() {},
      onCommitFiberRoot(id, root) {
        ctr.commits++; if (ctr.counting) ctr.winCommits++;
        if (!opts.transit) return;
        const stack = [root.current];
        while (stack.length) {
          const f = stack.pop();
          if (f.type && f.type.name === "TransitLayer") {
            if (f !== lastTL && (f.flags & 1)) { ctr.transit++; if (ctr.counting) ctr.winTransit++; }
            lastTL = f; if (f.sibling) stack.push(f.sibling); continue;
          }
          if (f.child) stack.push(f.child);
          if (f.sibling) stack.push(f.sibling);
        }
      },
    };
    try {
      new w.PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          ctr.longAll++; ctr.longAllMs += e.duration;
          if (ctr.counting) { ctr.longN++; ctr.longMs += e.duration; ctr.longMax = Math.max(ctr.longMax, e.duration); }
        }
      }).observe({ type: "longtask" });
    } catch (e) { R.ltErr = String(e); }
  };
  const res = (from = 0, to = Infinity) => {
    const all = w.performance.getEntriesByType("resource").filter((e) => e.startTime >= from && e.startTime < to);
    const out = { count: all.length, transfer: 0, encoded: 0, decoded: 0, cacheHits: 0, opaque: 0, byHost: {} };
    for (const e of all) {
      out.transfer += e.transferSize; out.encoded += e.encodedBodySize; out.decoded += e.decodedBodySize;
      if (e.transferSize === 0 && e.decodedBodySize > 0) out.cacheHits++;
      if (e.transferSize === 0 && e.decodedBodySize === 0) out.opaque++;
      const h = new URL(e.name).host; const b = (out.byHost[h] ||= { n: 0, enc: 0 }); b.n++; b.enc += e.encodedBodySize;
    }
    return out;
  };
  const heap = () => (w.performance.memory ? Math.round(w.performance.memory.usedJSHeapSize / 1048576) : null);
  (async () => {
    try {
      fr.src = opts.src;
      const t0 = performance.now();
      while (!installed && performance.now() - t0 < 20000) {
        try { const cw = fr.contentWindow; if (cw && cw.location.href !== "about:blank" && cw.document) { w = cw; install(); break; } } catch (e) {}
        await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
      }
      R.status = "waiting map";
      const t1 = performance.now();
      while (!map && performance.now() - t1 < 60000) { try { map = findMap(); } catch (e) {} if (!map) await sleep(20); }
      if (!map) { R.status = "no map"; return; }
      R.mapFoundAt = w.performance.now(); R.loadedWhenFound = map.loaded();
      map.once("load", () => (R.loadAt = w.performance.now()));
      map.once("idle", () => (R.firstIdleAt = w.performance.now()));
      map.on("render", () => { if (ctr.counting) ctr.renders++; });
      const t2 = performance.now();
      while (!R.firstIdleAt && performance.now() - t2 < 45000) {
        if (!R.tilesLoadedAt) { try { if (map.isStyleLoaded() && map.areTilesLoaded()) R.tilesLoadedAt = w.performance.now(); } catch (e) {} }
        await sleep(25);
      }
      await sleep(1000);
      const nav = w.performance.getEntriesByType("navigation")[0];
      const fcp = w.performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
      R.nav = nav && { dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), transfer: nav.transferSize, encoded: nav.encodedBodySize };
      R.fcp = fcp && Math.round(fcp.startTime);
      R.firstLoadRes = res(0, R.firstIdleAt || w.performance.now());
      R.heapAfterLoad = heap();
      R.longBeforeView = { n: ctr.longAll, ms: Math.round(ctr.longAllMs) };
      R.commitsBeforeView = ctr.commits;
      R.status = "view " + opts.view;
      const click = (label) => { const b = [...w.document.querySelectorAll('[data-testid="view-switcher"] button')].find((b) => b.textContent.trim() === label); if (b) { b.click(); return true; } return false; };
      if (opts.view === "tilt") R.viewOk = click("Up");
      if (opts.view === "street") {
        map.jumpTo({ center: [-73.9857, 40.758], zoom: 16 });
        await sleep(1500);
        if (typeof w.__walk === "function") { w.__walk({ lon: -73.9857, lat: 40.758 }); R.viewOk = "walk"; } else R.viewOk = click("Street") ? "button" : false;
      }
      await sleep(opts.settleMs ?? 10000);
      R.camera = { zoom: +map.getZoom().toFixed(2), pitch: Math.round(map.getPitch()), center: map.getCenter().toArray().map((n) => +n.toFixed(4)) };
      R.status = "measuring idle";
      const ws = w.performance.now();
      R.heapStart = heap();
      ctr.counting = true;
      let running = true;
      const raf = () => { if (!running) return; ctr.frames++; w.requestAnimationFrame(raf); };
      w.requestAnimationFrame(raf);
      let lagSum = 0, lagN = 0, lagMax = 0;
      let last = w.performance.now();
      const lagT = w.setInterval(() => { const n = w.performance.now(); const lag = n - last - 100; last = n; lagSum += Math.max(0, lag); lagN++; lagMax = Math.max(lagMax, lag); }, 100);
      await sleep(opts.idleMs ?? 60000);
      running = false; ctr.counting = false; w.clearInterval(lagT);
      const we = w.performance.now();
      const secs = (we - ws) / 1000;
      R.idle = {
        secs: +secs.toFixed(1), fps: +(ctr.frames / secs).toFixed(1), mapRendersPerSec: +(ctr.renders / secs).toFixed(1),
        longTasks: ctr.longN, longTaskMs: Math.round(ctr.longMs), longTaskMax: Math.round(ctr.longMax), busyPct: +((ctr.longMs / (we - ws)) * 100).toFixed(1),
        timerLagAvg: +(lagSum / Math.max(1, lagN)).toFixed(1), timerLagMax: Math.round(lagMax),
        reactCommits: ctr.winCommits, transitLayerRenders: opts.transit ? ctr.winTransit : null,
        heapStart: R.heapStart, heapEnd: heap(), net: res(ws, we),
      };
      R.status = "done";
    } catch (e) { R.status = "error"; R.err = String((e && e.stack) || e); }
  })();
  return "started";
};
```

</details>

## Check against the baseline (2026-10-25)

**The first load asks for fewer things and uses far less memory, but the crime and noise
summaries still download in the simple view.** This was one warm-cache load of the deployed
site (main at `855d675`) in the desktop app's browser pane, 1024 × 768, on the same
development Mac, with a load average near 5 (the baseline ran at 20–127). It is a spot check, not a new baseline: one run.

| | Baseline (2026-10-23, warm, 1440 × 900) | Now (2026-10-25, warm, 1024 × 768) |
|---|---|---|
| Requests on first load | 63 | 45 |
| Calls to our API in the first 20 s | not counted | 11, then 13 after 30 s |
| Main script | 1,869 KB (540 KB compressed) | 1,984 KB (582 KB compressed) |
| JavaScript heap after load | 199 MB | 71 MB |

The 11 API calls were 4 to `/api/aggregate` (the crime and noise summaries), 2 to
`/api/transit`, and one each to `/api/areas`, `/api/blocks`, `/api/transit-live`,
`/api/transit-segments/all` and `/api/transit/alerts`. Pull request #434 stops the
`/api/aggregate` calls unless an analytics layer is on, which removes the biggest download.
Measure again once it is live.

The main script grew by about 115 KB as the assistant gained features. Its size check in CI
caps the assistant's own chunk at 24 KB, not the main script.

Still not measured: the owner's phone and work computer, and a cold load on a phone network.
Those are the open part of #362.

## Emulated mid-range phone (2026-10-25)

**On a phone-speed CPU and a slow 4G link, the map appears after about 5 seconds and the page
is ready to use after about 9.** Most of the wait is the main script running, not the
download: the main bundle alone spends 3.6 s on a CPU four times slower than the Mac's. This
is the cold, empty-cache load on a phone network that the 2026-10-25 spot check was missing.

| Score (out of 100) | First paint | Largest paint | Blocking time | Ready to use | Requests | Transferred | Script time | Main bundle script time |
|---|---|---|---|---|---|---|---|---|
| 42 | 5.1 s | 8.9 s | 0.9 s | 8.9 s | 55 | 1.30 MB | 4.2 s | 3.6 s |

- **Device.** Lighthouse 13.5.0's mobile preset on the development Mac: a Moto G-sized screen,
  CPU slowed 4×, 150 ms round trip and about 1.6 Mbps down, empty cache. Lighthouse simulates
  the slowdown from one fast load, so the result depends less on how busy the Mac is.
- **Build.** The live site at main `613d0ca`, after #448 stopped the 311 block counts on the
  first screen and #449 moved to MapLibre 6.
- **Runs.** Each number is the median of three loads. They vary: one earlier single run
  measured 4.2 s of blocking time against this median of 0.9 s.
- **Biggest downloads.** The main script (612 KB), the subway map file `transit/subway.json`
  (228 KB), neighbourhood outlines from `/api/areas` (70 KB) and live trains from
  `/api/transit-live` (61 KB).
- **Not counted.** The map's tile worker fetches the vector tiles. Lighthouse lists those
  requests but records 0 bytes for them, so 1.30 MB is a floor.

Run it again with `npx tsx scripts/perf-throttled.ts [url] [runs]`. It needs a full Chromium
and uses Playwright's own copy unless `CHROME_PATH` is set.

An earlier attempt timed this with Playwright and Chrome's developer protocol directly. It
reported 31 requests and 0.65 MB because neither sees the tile worker's requests. It also
counted the main thread as 99.9% busy even without any slowdown, since in a headless browser
the map's software drawing never stops. Those numbers were thrown away. Idle cost is better
read from the frames-per-second and long-task table in [the baseline](#idle-minute-with-live-trains-on).

The owner's real phone and work computer are still unmeasured.

## Fastest wins, in order (proposal)
1. **Stop the transit re-render loop.** `TransitLayer` calls `setVehicles` about 15 times a second to animate trains, re-rendering the whole layer each time, and the console showed many "Maximum update depth exceeded" warnings. Move the animation out of React state.
2. **Top view is flat 2D (decided).** Do not load the three.js layer or 3D buildings in Top.
3. **Trains are colored boxes with a route tag (decided).** No 3D train models; details go in a side panel.
4. **Fewer network calls.** See below.
5. **Clean map by context (decided).** Draw only what the current task needs, with landmarks always visible.

## Network calls today (from the code)
- First load fires one `/api/transit-segments` request per subway line (34), refreshed every 10 minutes.
- Live trains for each rail system and each visible bus route are polled every 15 seconds; alerts every 60 seconds.
- The server caches each MTA feed in memory for about 15 seconds, so upstream MTA calls do not grow with users. Our server and bandwidth do.

## Network target (proposal)
- **One batched live endpoint** for transit, polled every 30 to 60 seconds, with an `ETag` so an unchanged reply is an empty 304.
- **Edge caching.** The site is behind a Cloudflare tunnel. Send `Cache-Control: public, s-maxage=30, stale-while-revalidate` and add a Cloudflare cache rule, so most users and page refreshes are served by the edge and only a few requests a minute reach our server. Not yet checked: the current Cloudflare cache configuration.
- **Upstream sync.** The server pulls MTA feeds about once a minute.
- **The 34 segment files become one prebuilt static file**, cached for hours.

## First (cold) load (proposal)
1. **Instant shell.** The flat map and the chat bar render first; no data request blocks them. 3D code loads only when the user tilts.
2. **Last real data, never mock data.** Keep the previous visit's data in IndexedDB and show it immediately, labelled "updated N min ago", then refresh in the background. Fake trains or delays would break "never make up numbers". The neighbourhood rollup is already cached in `localStorage`.
3. **One bootstrap request** for what the first screen needs: live trains near the user, active MTA alerts, anything about saved places.
4. **Daily and 7-day data are static files.** Noise, crashes, restrooms and segment history change at most daily; the nightly ingest writes them as prebuilt files cached by the edge and the browser for a day.
5. **Lazy-load everything else**, when a layer opens or the agent needs it; prefetch likely next data at low priority while the browser is idle.
6. **Load by viewport**, for example restrooms near the user first.

Rule of thumb: batch what the first screen needs, use static files for slow-changing data, lazy-load the rest. Avoid a queue of many small calls.

## Idle and left-open tabs (proposal)
- Hidden tabs already stop polling (TanStack Query's default).
- After about 10 minutes with no interaction in a visible tab, pause live updates and show "Paused — tap to resume".

## Abuse protection (proposal)
- **Origin IP.** Traffic reaches the server only through the Cloudflare tunnel. Not yet checked: that no other ports are publicly open.
- **Rate limits in two layers:** a Cloudflare per-IP rule on `/api/*`, and Caddy at the origin as a backstop.
- **Static assets** are hashed and cached as immutable, so refreshing costs almost nothing.

## LLM fair use, without a credits feel
- **No credits, no "upgrade".** Limit messages read as fair use for a free, open-source project.
- **Limit shape (proposal; the owner suggested a 3-hour cooldown and has not confirmed this):** a rolling window, for example 20 questions per 3 hours per device and IP, where each question frees up 3 hours after it was used, plus a short burst limit (about 5 a minute). The message says when the next question frees up.
- **During any wait** the map, restrooms and the no-model quick answers keep working.
- **Global daily spending cap:** when reached, switch to the cheapest model or to no-model answers, with a note that the map still works.
- **Keep calls cheap:** cache answers to repeated questions, cap reply length and context, and show Cloudflare Turnstile only when traffic looks abusive.
- **Always a model available:** primary `cb/deepseek-v4.1-flash` on InferHub with the existing fallback chain (`server/features/agent/model-fallback.ts`, `INFERHUB_MODEL_FALLBACKS`) and busy-retry (#343).
