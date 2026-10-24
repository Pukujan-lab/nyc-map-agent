# Roadmap and goals

*Written 2026-10-23 from the owner's realignment conversation. "Exists" means present in the repo or in an open PR; nothing here has been verified as working for a real user unless it says so. PR and issue numbers refer to `Pukujan/nyc-map-agent`.*

## Decisions, 2026-10-23 (owner)
- **Simple, fast map is the default.** Plain colored block shapes (the repo already has real tax-block tiles), only the route and the data that answers the question, few labels, drawn by MapLibre alone. Reference: the owner's "Walk mode · live" mock with an "Agents working" panel (Planner, Data query, Search) as the loading state.
- **The detailed 3D city becomes an optional module, off by default.** It is heavy, does not run on many computers, and slows the owner's work computer. It stays behind a flag (the flag registry's advanced tier) for later work; fixing it is not on the critical path.
- **Landmarks stay recognisable** in the simple map so people know where they are. Street level and Live View keep real detail for the underground and exit problem.
- **Fix duplicate filters.** The Layers menu and Layers & filters overlap. (An older branch, `fix/layers-dedupe-44`, may be related; not checked.)
- **Secondary goal: know exactly which street a shop or restaurant is on** ("that's where McDonald's is"), fast and easy. Storefront layers and signs exist (`src/features/storefronts`); a fast find-it flow does not.
- **Order of work:** keep the app fast and accessible and deliver the main goal first; optional modules come later.

## Main goal
An accessible chat and voice agent that shows its answers on a clean map (`PROJECT.md`). Work so far leaned toward visual polish and technical issues; from now on, rank work by whether it moves this goal.

## Priorities

### 1. The agent-first screen (not built)
A map with a chat prompt at the bottom and a Siri-style voice mode. Today: a top search bar with a small "Ask" button and camera controls at the bottom. Related: hands-free Ask (merged), voice fallback #199 / PR #200 (mostly superseded), agent busy-retry #343.
- Every answer carries buttons that draw it on the map (show skipped stops, substitute route and where to board, where the stuck train is, nearest restroom, exits). Not built.
- Many languages in chat and voice. Not checked.

### 2. Restrooms
Exists: PR #350 (nearest restroom from the street position, directions, mini-map chip, filters on the mini map; supersedes #324, #338, #339), shop and café toilets (merged). CI failure on #350: a module-boundary rule (`StreetMiniMap.tsx` imports `features/restrooms`). Not run end to end.

### 3. Transit trouble made readable
Exists in pieces: #329 (train leaves the station; ready), #336 (underground dash width; ready), #337 (end Follow on map click), #330 plus review fixes (stops, delays and notices while following), #340 (phone follow layout; checked at 390 and 1280 px), #298 (train stops sheet; needs rebase), #198 (mostly superseded by #262).
Missing: substitute-bus routes with where to board, "which station lets me switch direction", "which train instead", and a push notice when a train is stuck.

### 4. Underground and exit help (not built)
Nearest piece: Live View camera and compass scaffold, PR #359 (not tested on a device). Needs an "are you underground?" state, exit choice, and facing recalibration.

### 5. Landmarks
Exists: #326 (landmarks with a picture; ready). Missing: landmarks as the always-on guide in the clean map.

### 6. Clean, context-driven map
Exists, manual only: Transit Focus switch, Lines isolate. Wanted: automatic from context (on a subway show only your line plus landmarks). **Top view must be plain flat 2D**; today it still tries to render 3D.

### 7. Trip simulator
Exists: playback speeds (merged #289). Wanted: scheduled time ("tomorrow 9 am"), expected conditions, and stop-and-restart when the user picks an alternative (today the simulation does not).

### 8. Weather and traffic shown in street view
Folders `src/features/weather` and `src/features/traffic` exist; not checked for what they draw. Wanted: visible rain or snow with how much, driving traffic on the route.

### 9. Place questions from data (secondary)
Exists: 311 noise rollup by neighbourhood, crashes, per-street crash levels in PR #352. Missing or unconfirmed: year-by-year trend, how authorities respond, comparison to borough and city average, whole-route school safety summary.

### 10. Virtual NYC: businesses and food (third)
Storefront layers exist; a find-by-question flow does not.

### 11. Agent reliability and cost (owner's requirements, 2026-10-23)
- **Always have a model.** Primary is `cb/deepseek-v4.1-flash` through InferHub (cheapest and best, per the owner). Fall back when one or two models or providers are down. Exists on main: a model chain with `INFERHUB_MODEL_FALLBACKS` (tried on 402, model not found or 5xx) and retry when InferHub reports a busy market (#343, merged). Not confirmed: a fallback that does not depend on InferHub being up at all.
- **Rate limits** so people cannot spam or abuse the agent. Not found on main; the earlier voice PR #200 carried caps and a rate limit but is unmerged and mostly superseded.
- **Better loading animation, and a voice that talks through the wait** for slow model or voice responses ("one moment, checking the trains"). Today: a text skeleton in the chat panel only. Not built.
- **Smarter instructions for the agent** so it asks good follow-up questions and uses the data it has (what datasets exist, their limits, which map action fits which question). Today: tool guidance in `context/CHAT_TOOLS.md`; a richer system prompt tied to the dataset registry is not built.

## Speed and abuse
See `docs/PERFORMANCE.md` for the fastest wins, the first-load plan, network calls, idle tabs, rate limits and LLM fair use.

## Known problems to fix (owner's list)
- **Top view renders 3D** instead of flat and fast.
- **Train 3D model** causes problems. Decision: draw a colored box with the train tag on top, and show next stops, timings and MTA notices in a side panel.
- **Too many API calls.** Server caches MTA feeds about 15 s, but each open browser polls live data every 15 s and fires one request per subway line (34 on first load). Plan: a batched endpoint, client sync every 30 to 60 s, server syncs upstream every minute.
- **3D city looks flat (no shadows) but cannot get heavier.** Plan: keep MapLibre plus three.js and use game-style techniques (draw 3D only near the camera, simple far shapes, instancing, baked shadows); do not switch to a game engine, which would mean rewriting the map, routing and labels. Related: #279 sun shadows, #355 3D tiles script, #220 and #221 three.js upgrade and split.
- **Trip simulation does not restart** when the user picks an alternative route.

## Housekeeping that blocks shipping
Several open PRs fail CI (module-boundary rule on #350 and #352, lint on #355, size on #360, audit on #351, unconfirmed on #347 and #358). Merge order for the follow-card PRs: #329 and #336, then #337, then #330, then #340. #320 conflicts with #340 on the phone Layers button; decision made: keep Layers on phones. #357 contains a database migration that has never been run.

## Open questions
- Is the main user a local or a visitor?
- Where do the technical dashboards live: behind advanced mode, a separate page, or removed?
- Is voice the main way in, or equal to typing?
- Does Live View (#192) move up in priority because of the underground problem?
