# Chat actions

There are two chats. The **trip assistant** (`POST /api/agent`, `server/features/agent/`) is the real model with live tools. The **data chat** (`src/lib/agent/`, the mocked layer) answers noise and crash questions from the loaded aggregates.

## Trip assistant (`POST /api/agent`)

The system prompt lives in `server/features/agent/prompt.ts`. It ranks what people come for: (1) trips, now or at a set time, and simulated trips (the flythrough), (2) the nearest restroom, (3) landmarks, (4) underground help (entrances, exits, elevators), (5) MTA trouble in plain words, (6) weather and traffic for a trip. Place questions (noise, crashes, housing) come second, and businesses and food come third. The prompt also tells the model to:
- ask one short follow-up question when something a tool needs is missing (no destination, or no start point while the location is unknown), and not ask when a sensible default exists;
- prefer tools that put the answer on the map over describing it in words;
- reply in the user's language, in 1 to 3 short spoken sentences;
- **never guess**: every figure must come from a tool result in the conversation; otherwise say "I don't have data on that";
- state known limits: 311 counts are reports people made, not measured noise; crash data covers police reports only and runs weeks to months behind; the city's restroom list can be out of date ("listed as open").

The lists of live feeds and map layers in the prompt are generated from `SOURCE_INFO` (`server/features/agent/freshness.ts`) and the dataset registry (`src/lib/datasets/registry.ts`), so they cannot name a source the app does not have. `prompt.test.ts` checks that every tool the prompt names exists.

### Tools
| Tool | Use it for | Data and limits |
|---|---|---|
| `transit_plan` | Door-to-door transit trips, including arrive-by | OpenTripPlanner (built-in subway router if it is down), plus weather, MTA alerts, skipped stations, elevator outages and the recommended exit |
| `drive_plan` | Car trips | OSRM car route, DOT traffic speeds, street and event closures, 511NY (needs a key), MTA toll table, crash hotspots |
| `route_walk` | Walking routes | OSRM foot profile |
| `nearest_restroom` | "Nearest toilet" | NYC Open Data Public Restrooms; open ones first; the list updates irregularly |
| `line_status` | "Is the L running?", delays, skipped stops, shuttle buses and where to board them, where to get the train back, where to switch direction, other lines at a skipped station, a stuck train | MTA subway alerts feed only (no buses, LIRR or Metro-North). Shuttle stops and switch stations only when the alert text names them; no dataset lists free crossovers. A stuck train is one with no position update for 5 min, mid-trip, on a line with a live delay alert; it is placed at its station (the feed has no coordinates). |
| `elevator_status` | Elevator and escalator outages at a station | MTA elevator and escalator feed |
| `weather_forecast`, `hazards` | Weather at a place and time, active warnings | Open-Meteo (up to 7 days ahead), National Weather Service alerts |
| `geocode`, `flyTo`, `enterStreetView` | Landmarks and addresses | Curated landmarks, station names, NYC GeoSearch |
| `showRoute`, `openPanel`, `playFlythrough`, `setTime` | Draw a planned trip, its summary panel, the simulated ride, the map time | The trip a planning tool returned (by `tripId`) |

There is no tool for counts of noise, crashes or housing at a place, or for businesses and food. The model says so and names the map layer that shows it.

### Stream lines (NDJSON, `src/features/agent/schema.ts`)
- `text`, `tool`, `command`, `error`, `done`: the answer, tool progress, map commands, failures, and token usage.
- `actions` (#371): up to 6 buttons that show the answer on the map (route, a line's stops, skipped stops, crashes on the route, the restroom, a place). The server builds them from tool results, never from the model's words.
- `sources` (#375): sent once, before `done`. It has `sources: [{ id, label, asOf, url?, stale, note? }]` and `unverified: string[]`. `asOf` is the time the data describes: the MTA feed's own timestamp, the dataset's last update for NYC Open Data, or the fetch time when a feed gives none (`null` when unknown). A source is marked `stale` after 2 minutes for MTA alerts, 10 minutes for elevators, 15 minutes for traffic speeds and 511NY, 30 minutes for weather warnings, 3 hours for forecasts, 3 days for daily datasets (closures, events, crashes), and 180 days for the restroom list. `unverified` lists figures the reply stated when no data tool returned anything. The server checks only that case, because when tools did run, a reply can fairly derive numbers from them ("20 minutes faster").
- Each data tool's result also tells the model its `sources` (with `asOf` in New York time and `stale`), so the model can say when data may be out of date. The chat shows the line under the answer as "Sources · MTA service alerts, updated 40 s ago".

## Data chat (mocked layer)

The data chat answers only by calling these actions. Every number it says must come from `query_data`.

### Actions

#### query_data
Runs a read-only query on the noise and crash data from F1. You can also send the same query straight to the Socrata API (see DATA_APIS.md).
- Input: `{ dataset: "noise" | "crashes", filters, group_by, metric, limit }`, or a raw read-only SQL or SoQL string
- Output: rows and the query that was run, so it can be shown as a source

#### fly_to
Moves the camera.
- Input: `{ place?: string, lat?: number, lon?: number, zoom?: number, pitch?: number }`

#### set_layer
Changes what the map shows.
- Input: `{ layer: "noise" | "crashes" | "combined", complaint_types?: string[], date_from?, date_to?, hours?: [start, end], weekdays?: number[] }`

#### highlight
Outlines specific cells, streets, or neighborhoods.
- Input: `{ cell_ids?: string[], nta_codes?: string[], points?: [lat, lon][] }`

### Answer format
Keep answers short and lead with the number. Name the place and the time window, and offer a "show query" link to the source. After answering, call `fly_to`, `set_layer`, or `highlight` so the map matches.

### Five acceptance questions (F4)
1. Where is the loudest block in Bushwick on weekend nights (10pm to 4am)?
2. Which 5 neighborhoods had the most residential noise complaints in the last 12 months?
3. Which Brooklyn intersections have the most cyclist injuries?
4. What is the top crash cause in Manhattan, and how many crashes did it cause?
5. How many helicopter noise complaints were there near the Downtown Manhattan Heliport last summer?

For each one, check the answer against a direct API query from DATA_APIS.md.
