# NYC Map Agent

Ask anything about how loud or how dangerous a NYC street is, and watch the answer appear on the map.

Two datasets are joined to 2020 Neighborhood Tabulation Areas in the browser and drawn as colored columns: **311 noise complaints** (`erm2-nwe9`) and **motor vehicle crashes** (`h9gi-nx95`). A chat panel answers in plain language, and every answer moves or highlights the map.

The map opens flat and north-up over a vector basemap with real extruded buildings. Switch between **Neighborhoods** and **Blocks** (~300 m squares), read the value off four colors — blue, green, yellow, red — whose ranges are printed in the legend, then press the box button to tilt the camera down to 62° and compare column heights. Both encodings come from the same number: color is the bucket, height is a square-root scale of the value.

The screen is one dock. Legend, layer switch, tilt, settings and chat sit in a single pill at the bottom; the time window, scale, neighborhood jump, zoom and data caveats live in the settings drawer, and chat and details open as sheets.

![one screen: full-bleed map and a single bottom dock](context/BRIEF.md)

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # vitest: geo math, CSV parsing, map/color model, agent answers
pnpm typecheck  # tsc --noEmit
pnpm build      # typecheck + production build
```

No key is required. The first load pages ~205k noise rows and ~60k crash rows from NYC Open Data, which takes a few seconds; the neighborhood rollup is then cached in `localStorage`, so a reload is instant.

## Environment

Copy `.env.example` to `.env` and fill in what you need.

| Variable | Side | Purpose |
| --- | --- | --- |
| `VITE_SOCRATA_APP_TOKEN` | browser | Optional. Raises Socrata rate limits for the ~205k-row pull. The app works without it. |
| `VITE_BASEMAP_STYLE` | browser | MapLibre style URL. Defaults to OpenFreeMap Liberty (keyless, includes 3D buildings). |
| `VITE_TILE_URL` | browser | Raster tiles for the fallback style, used only if the vector basemap fails. Defaults to public OSM tiles. |
| `VITE_MAPILLARY_TOKEN` or `MAPILLARY_TOKEN` | browser | Optional Mapillary **client** token for street-level photos. Either name works (`vite.config.ts` sets `envPrefix: ["VITE_", "MAPILLARY_"]`). Client tokens ship in the bundle by design. |
| `VITE_OSRM_URL` | browser | Optional OSRM base URL for walking directions. Defaults to the public FOSSGIS foot instance `https://routing.openstreetmap.de/routed-foot`. |
| `VITE_AGENT_MODE` | browser | `mock` (default) or `http`. See below. |
| `INFERHUB_API_KEY` | **server only** | Never `VITE_`-prefixed, never in the bundle. Used by your `/api/chat` handler. |

## Data sources

Every map source is one entry in `src/lib/datasets/registry.ts`; the data-sources drawer, the view dropdown, the legend and the details sheet all read from it. Geo columns were checked with live SODA queries (run them yourself with `LIVE_SOCRATA=1 pnpm test`).

| Source | Dataset | Geo used | Window | How it is fetched |
| --- | --- | --- | --- | --- |
| 311 noise complaints | `erm2-nwe9` | `latitude`/`longitude` | selected | worker pipeline (rows) |
| All 311 service requests | `erm2-nwe9` | `latitude`/`longitude` | selected (`created_date`) | server-side grid `GROUP BY` |
| Motor vehicle crashes | `h9gi-nx95` | `latitude`/`longitude` | latest 12 months | worker pipeline (rows) |
| HPD housing violations | `wvxf-dwi5` | `latitude`/`longitude` (text, cast) | selected (`inspectiondate`) | server-side grid `GROUP BY` |
| Residential units (PLUTO) | `64uk-42ks` | `latitude`/`longitude` | snapshot | server-side `sum(unitsres)` per cell |
| Street trees (2015) | `uvpi-gqnh` | `latitude`/`longitude` | census | server-side grid `GROUP BY` |
| Pedestrian ramps | `ufzp-rrqu` | `the_geom` point | inventory | paged rows (cap 250k) |
| Speed humps | `jknp-skuy` | `the_geom` multiline (midpoint) | inventory | paged rows |
| SIP corridors | `if4c-w48d` | `the_geom` multiline (midpoint) | inventory | paged rows |
| SIP intersections | `shr7-eqdc` | `lat`/`long` (text, cast) | inventory | server-side grid `GROUP BY` |

The server-side rollup is `floor(lat / 0.003), floor(lon / 0.003)`, which is the same ~300 m block grid the map draws. Even an 850k-row dataset comes back as a few thousand cells. Each cell goes to the neighborhood under its centre.

**Not wired:** DOB complaints (`eabe-havv`) has no coordinates; traffic volume counts (`7ym2-wayt`) are WKT in NY State Plane feet and would need a reprojection library; building footprints (`5zhs-2jue`) are ~1M polygons with no centroid column.

### Views: single source vs. Concern score (Average)

The view dropdown in the dock (and in the settings drawer) can show the classic noise / crashes / both layers, **any single enabled source**, or the **Concern score**, which is an average across sources. Each ticked source becomes a 0–100 percentile rank per area (ties share their rank, areas with no records rank 0).

Every registry entry has a default `polarity`:
- **Higher is worse:** 311, noise, crashes and HPD violations count as is.
- **Higher is better:** trees, ramps, speed humps, street improvements and residential units count as `100 − percentile`.

So a high score always means more concern. The data-sources drawer has a button on each source in the average to flip its direction. The legend marks each contributor ↑ (higher is worse) or ↓ (higher is better). The details sheet shows each source's raw count, percentile, direction and concern contribution.

View state lives in the URL: `view=avg|src:<id>|legacy`, `sources=…`, `avg=…`, and `flip=…` for the sources whose default direction was flipped.

## Walking directions

The dock's navigation button or the details sheet ("Route from / to here") let you set A and B. The route comes from OSRM's foot profile on the public FOSSGIS server (`routing.openstreetmap.de`), with no key and one request per pick. It is drawn on the map with its distance and walking time, and **Walk along route** moves the street camera along it. That server is a donated community service. Its [usage policy](https://routing.openstreetmap.de/about.html) asks for light, non-bulk use and OSM attribution, so set `VITE_OSRM_URL` to your own OSRM for real traffic.

## How the data gets on the map

```
Socrata SODA ──► src/lib/api/{socrata,noise,crashes,nta}.ts
                        │
                        ▼
              src/lib/geo/aggregate.worker.ts      (module Web Worker)
              count → page CSV 50k rows → zod → point-in-polygon join → rollup
                        │  postMessage(progress | done)
                        ▼
              TanStack Query ──► localStorage (aggregate only, never rows)
                        │
                        ▼
   MapStateContext ──► MapView (MapLibre fill-extrusion) + DetailsSheet
                        ▲
  ChatPanel ──► AgentClient (mock | http) ──► execute.ts ──► same MapStateContext
                        ▲
                   useSpeech (STT/TTS)
```

- **The join is the real work.** Neither dataset carries a neighborhood code, so `src/lib/geo/ntaIndex.ts` buckets the city into 0.01° (~1.1 km) cells that map to candidate NTAs; each point then ray-casts 1–2 polygons instead of 262. It runs off the main thread so the map stays at 60fps.
- **Rollup, not raw points.** Per neighborhood we keep counts, a 24-slot hour histogram, month histogram, night and weekend-night counts, top complaint types/descriptors/contributing factors, injuries, deaths and cyclist injuries. The same pass also fills a fixed ~300 m block grid, so the Blocks view needs no extra fetch. ~262 neighborhood rows plus a few thousand block cells, cached; the raw rows are thrown away.
- **One renderer.** MapLibre draws the columns itself with `fill-extrusion` layers over two GeoJSON sources (`src/lib/map/style.ts`). No deck.gl, no overlay control, no second canvas — so the prisms depth-sort against the basemap and picking goes through `queryRenderedFeatures`, with an O(1) grid/index fallback if a query comes back empty.
- **A city, not a plate.** `src/lib/map/basemap.ts` loads a keyless vector style (OpenFreeMap Liberty) and injects the data layers above it, adds an extruded-buildings layer if the style has none, lifts the style's labels back on top, and sets fog for horizon haze. The columns are translucent, so streets and buildings read through the color. If the style cannot be fetched, `buildFallbackStyle()` swaps in the bundled raster OSM style — the map is never blank.
- **Walk it.** The footprints button drops the camera to eye level (85° pitch, zoom 19.5 — about 8 m above the pavement, since zoom is the only altitude control the map has) and hands you the street: W/S move, A/D turn, Shift runs, Esc leaves — plus a d-pad on touch. The block prisms flatten to a coloured carpet while you walk, so the columns cannot swallow the view. Movement is in ground metres (`stepPose()` in `src/lib/map/walk.ts`), so walking pace does not change when you scroll the zoom. `src/lib/map/walk.test.ts` covers the maths.
- **The picked block is obvious.** Selecting a block raises a thin white rim around its square (`blockSelectionToGeoJson`) rather than a filled shell, because a shell shares its faces with the block's own column and flickers; the rim stands clear of it at any tilt, and stays visible while you walk through it.
- **Color, then height.** `src/lib/layers.ts` cuts the non-zero values into quartiles and maps them to four colors, so each band covers roughly a quarter of the areas with data. `heightFor()` turns the same value into column meters on a square-root scale. The legend reads its ranges, counts and peak from the same function, so the two cannot drift.
- **Time windows.** Noise uses the selected window (90 days or 12 months). Crashes always use the **newest 12 months**, because the NYPD dataset lags about four months — a 90-day crash window can be empty. Every surface that shows crash numbers says so.
- **Nothing is silently dropped.** Points outside every neighborhood land in `unassignedCount`, malformed rows in `malformedCount`, and both are reported in the caveats sheet (Legend → Details).

## What is real and what is mocked

**Real:** both Socrata queries, the spatial join, every number on the map, in the details panel, in the charts, and in every chat answer. The "show query" row prints the actual SoQL used to fetch the rows plus the local rollup that produced the figure.

**Mocked:** only the language model. `MockAgentClient` pattern-matches the questions from `context/CHAT_TOOLS.md` (plus "how does X compare") and computes its answers from the loaded aggregates through `src/lib/agent/query.ts` — the same code path the tool executor uses. It emits genuine `fly_to` / `set_layer` / `highlight` calls.

## Plugging in the real model

Everything the model layer needs is behind one interface in `src/lib/agent/client.ts`:

```ts
export interface AgentClient {
  send(messages: ChatTurn[], context: AgentContext): Promise<AgentReply>;
}
```

Set `VITE_AGENT_MODE=http` and implement `POST /api/chat`. The request/response contract, the tool definitions and the rules the server must uphold are documented at the top of `src/lib/agent/httpAgent.ts` and exported as `TOOL_DEFINITIONS` from `src/lib/agent/tools.ts`.

Two guarantees survive the swap:

1. Tool-call arguments are parsed with zod before anything acts on them (`src/lib/agent/tools.ts`).
2. **Sources are produced by `src/lib/agent/execute.ts`, never by the agent.** A model cannot fabricate a "show query" citation, and a reply that omits all of `fly_to` / `set_layer` / `highlight` simply doesn't move the map.

If `/api/chat` is missing or returns something off-contract, the chat shows a clean error and the map keeps working — that is the cheapest way to prove the seam is real.

## Voice

`src/lib/voice/useSpeech.ts` wraps `SpeechRecognition` (with the `webkit` prefix) and `speechSynthesis`. The transcript is appended to the same message history, the spoken reply is a short summary of the text answer, and the map flight happens at the same time. If the browser has no speech recognition, or the microphone is blocked, the mic button disables itself, a toast explains why, and typing still works.

## Tests

```bash
pnpm test
```

- `pointInPolygon.test.ts` — ray casting, concave shapes, holes, bucket assignment and bucket-edge isolation
- `socrata.test.ts` — RFC4180-ish CSV parsing and percent-encoded SoQL URLs
- `layers.test.ts` — height scaling, per-layer counts, empty state
- `walk.test.ts` — walk-mode movement, turning, sprinting, frame clamping, key/pad resolution
- `mockAgent.test.ts` — the five acceptance questions plus the honest fallback, run against synthetic aggregates

## Data caveats

- 311 counts are **reported complaints**, not measured noise. Reporting rates differ by neighborhood.
- Crash data lags about four months.
- Neighborhoods come from a point-in-polygon join, so a point on a shared border goes to whichever neighbor wins the test.
- The default basemap (OpenFreeMap Liberty) is keyless and free for this kind of use, but it is a third-party service: point `VITE_BASEMAP_STYLE` at your own MapTiler/Protomaps style before shipping at volume. Attribution is always visible, and if the style cannot be fetched the app falls back to public OSM raster tiles (`VITE_TILE_URL`), which are not meant for public traffic either.
