# Performance, loading and abuse protection

*Written 2026-10-23 from the owner's conversation. **Decided** means the owner agreed; **proposal** means suggested and not yet confirmed. Numbers come from reading the code; nothing here has been profiled or measured yet.*

## Why this matters
The map makes the owner's computer and phone slow, and the project is open source with no budget for runaway API or model costs. Speed and abuse protection serve the main goal: an agent that is always available and feels light.

## Measure first
Before and after each change, record one phone-size first load: number of requests, bytes transferred, time to first map, and CPU while idle with live trains on. Without this we cannot tell whether a change helped.

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
