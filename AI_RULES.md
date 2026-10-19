# AI_RULES.md

Project guidance for the NYC Map Agent. Read this before writing code. Product scope lives in `context/` (`BRIEF.md`, `FEATURES.md`, `DATA_APIS.md`, `AI_VOICE.md`, `CHAT_TOOLS.md`).

## Tech stack

- **React 18 + TypeScript** single-page app, built with Vite. Strict types, no `any` in app code.
- **React Router** for routing. All routes live in `src/App.tsx`; pages live in `src/pages/`.
- **Tailwind CSS** for all styling. No CSS-in-JS, no styled-components, no hand-written `.css` files beyond `src/index.css`.
- **shadcn/ui** (Radix primitives) for every standard control: buttons, dialogs, sheets, tabs, tooltips, selects, sliders, toasts.
- **deck.gl** (`@deck.gl/react`, `@deck.gl/layers`, `@deck.gl/aggregation-layers`) renders the extruded 3D columns. Height = incident count, color = severity.
- **MapLibre GL + react-map-gl** provides the map canvas and camera control, with OpenStreetMap raster tiles and an "© OpenStreetMap contributors" attribution.
- **TanStack Query** owns all server state: Socrata fetches, cell/neighborhood aggregates, caching, retries.
- **Recharts** (via the shadcn `chart` component) for the hour-of-day and breakdown charts.
- **lucide-react** for all icons. No icon fonts, no inline SVG one-offs.
- **InferHub DeepSeek** (`POST /v1/chat/completions`, tool calling) is the chat/voice brain, called only from a server-side handler.
- **Web Speech API** (`SpeechRecognition` / `speechSynthesis`) powers push-to-talk and spoken answers.

## Library rules — use this for that

| Need | Use | Never use |
| --- | --- | --- |
| Any UI control | shadcn/ui from `src/components/ui/` | Raw unstyled `<div>` buttons, MUI, Chakra, Ant |
| Layout, spacing, color, responsive | Tailwind utility classes | inline `style` (except deck.gl/map props), CSS modules |
| Icons | `lucide-react` | Font Awesome, emoji as icons |
| 3D columns / hexagon aggregation | deck.gl layers | Three.js written from scratch, CSS 3D transforms |
| Basemap, camera, fly-to | MapLibre + react-map-gl, driven by deck.gl `viewState` | Google Maps, a hand-rolled canvas renderer |
| Fetching Socrata / any HTTP | `fetch` inside TanStack Query hooks in `src/lib/api/` | `axios`, raw `useEffect` + `fetch`, SWR |
| Charts and histograms | Recharts via shadcn `chart` | Chart.js, D3, Highcharts |
| Dates and time windows | `date-fns` | `moment`, manual `Date` math for ranges |
| Number/percent/locale formatting | `Intl.NumberFormat` | custom formatters, `numeral` |
| Runtime validation at boundaries (API rows, tool args) | `zod` | hand-written `if` chains over `unknown` |
| URL query state (layer, filters) | `useSearchParams` from React Router | a separate state library for URL state |
| Client UI state | `useState` / `useReducer` + one React context | Redux, Zustand, MobX, Jotai |
| Notifications | shadcn `sonner` / `toast` | `alert()` |
| Loading placeholders | shadcn `skeleton` | spinners built from scratch |
| Unique ids | `crypto.randomUUID()` | `Math.random()` id strings |

If a task seems to need a library not on this list, prefer the closest listed option. Adding a dependency requires a clear reason and a note in this file.

## Data and correctness rules

- **Every number shown in chat or on the map comes from a query.** The model never computes or recalls a figure; it calls `query_data` and reports the returned rows. If a query fails, say so — do not estimate.
- Socrata access goes through typed hooks in `src/lib/api/` (`socrata.ts` + `noise.ts` / `crashes.ts`). Build SoQL with `URLSearchParams`, never string concatenation into a URL.
- Read `X-App-Token` from `import.meta.env.VITE_SOCRATA_APP_TOKEN` when present; the app must work without it.
- Place points by `latitude`/`longitude`, not the `borough` field (street noise rows are often `Unspecified`).
- Surface data caveats in the UI: 311 is reported complaints, not measured noise; crash data lags a few months.
- Aggregate once, then render: cell and NTA rollups are computed in the query layer and cached, not recomputed per render or per column.

## AI, chat, and voice rules

- `INFERHUB_API_KEY` lives in a gitignored `.env`, has no `VITE_` prefix, and is never logged or sent to the browser. Chat goes through a server-side handler that proxies InferHub.
- The tool schema in `src/lib/agent/tools.ts` mirrors `context/CHAT_TOOLS.md` exactly: `query_data`, `fly_to`, `set_layer`, `highlight`.
- Model default: `deepseek/deepseek-v4-flash`; escalate to `deepseek/deepseek-v4-pro` only for multi-step questions.
- Validate every tool-call argument with zod before acting on it, and every tool result before rendering it.
- Answers are short, lead with the number, and name place + time window, plus a "show query" source link. Each answer must trigger `fly_to`, `set_layer`, or `highlight`.
- Voice reuses the same chat flow: transcript is appended to the same message history, spoken reply is a short summary of the text answer, and a blocked microphone degrades to typing with an explanatory message.

## Code organization

- `src/pages/` route screens; `src/components/` feature components; `src/components/ui/` shadcn primitives (do not edit these — compose new components instead).
- `src/lib/api/` data access, `src/lib/agent/` model client + tools, `src/lib/geo/` cell + NTA aggregation, `src/lib/format.ts` display helpers.
- Keep files small and single-purpose; extract a component or hook when a file passes ~200 lines.
- Props and shared data shapes get explicit exported types; no `React.FC`, no default-exported anonymous components.
- Update `src/pages/Index.tsx` so new work is actually reachable — an unreferenced component is an unfinished feature.

## UI and accessibility

- Mobile-first Tailwind; the map is full-bleed and panels are shadcn `sheet`/`card` overlays that stay usable at 375px wide.
- Every control is keyboard reachable with a visible focus ring; every icon-only button has an `aria-label`.
- The map has a text equivalent: the details panel and chat carry the same numbers, so nothing is map-only.
- Respect `prefers-reduced-motion` for camera flights — jump instead of animate.
- Dark theme via Tailwind `dark:` classes and CSS variables from `src/index.css`; no hard-coded hex colors in components.
