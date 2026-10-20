# NYC Map Agent

Ask anything about how loud or how dangerous a NYC street is, and watch the answer appear on the map.

Two datasets are joined to 2020 Neighborhood Tabulation Areas in the browser and drawn as flat colored blocks: **311 noise complaints** (`erm2-nwe9`) and **motor vehicle crashes** (`h9gi-nx95`). A chat panel answers in plain language, and every answer moves or highlights the map.

The map is deliberately simple: no tilt, no 3D, no rotation. Switch between **Neighborhoods** and **Blocks** (~300 m squares), and read the value off four colors — blue, green, yellow, red — whose ranges are printed in the legend.

![one screen: full-bleed map, control card, legend, chat](context/BRIEF.md)

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
| `VITE_TILE_URL` | browser | Basemap raster tiles. Defaults to the public OSM tiles. |
| `VITE_AGENT_MODE` | browser | `mock` (default) or `http`. See below. |
| `INFERHUB_API_KEY` | **server only** | Never `VITE_`-prefixed, never in the bundle. Used by your `/api/chat` handler. |

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
   MapStateContext ──► MapView (deck.gl flat fills) + DetailsSheet
                        ▲
  ChatPanel ──► AgentClient (mock | http) ──► execute.ts ──► same MapStateContext
                        ▲
                   useSpeech (STT/TTS)
```

- **The join is the real work.** Neither dataset carries a neighborhood code, so `src/lib/geo/ntaIndex.ts` buckets the city into 0.01° (~1.1 km) cells that map to candidate NTAs; each point then ray-casts 1–2 polygons instead of 262. It runs off the main thread so the map stays at 60fps.
- **Rollup, not raw points.** Per neighborhood we keep counts, a 24-slot hour histogram, month histogram, night and weekend-night counts, top complaint types/descriptors/contributing factors, injuries, deaths and cyclist injuries. The same pass also fills a fixed ~300 m block grid, so the Blocks view needs no extra fetch. ~262 neighborhood rows plus a few thousand block cells, cached; the raw rows are thrown away.
- **Color, not height.** `src/lib/layers.ts` cuts the non-zero values into quartiles and maps them to four flat colors, so each band covers roughly a quarter of the areas with data. The legend reads its ranges and counts from the same function, so the two cannot drift.
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
- `mockAgent.test.ts` — the five acceptance questions plus the honest fallback, run against synthetic aggregates

## Data caveats

- 311 counts are **reported complaints**, not measured noise. Reporting rates differ by neighborhood.
- Crash data lags about four months.
- Neighborhoods come from a point-in-polygon join, so a point on a shared border goes to whichever neighbor wins the test.
- The bundled OSM raster tiles are fine for a demo but not for public traffic. Point `VITE_TILE_URL` at a hosted provider before shipping. Attribution is always visible.
