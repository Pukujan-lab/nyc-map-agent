# Current repository checkpoint

<!-- continuity:current {"active_task": null, "active_task_file": null, "protocol_version": "0.1.0-draft", "schema": "project-continuity.current.v1"} -->

## Current projection

*Updated 2026-10-25. Read this first; it says where the work stands so a new agent does not have to rebuild that from branches and pull requests.*

GitHub Issues own task scope and progress; this file is a projection of them, not task authority. No Project Continuity Modules (PCM) task file is active, so `tasks/` is still empty. The build plan is [`docs/PDD.md`](../docs/PDD.md) (the product design document): what is built, what remains, how to check it and how to ship it. The design rules every screen must follow are in [`docs/DESIGN_RULES.md`](../docs/DESIGN_RULES.md).

**What the project is now.** An agent-first map of New York City: a chat and voice assistant over a clean map that helps people get around (restrooms, landmarks, subway exits, readable MTA disruptions). The realignment is described in [`PROJECT.md`](../PROJECT.md). Work from before the realignment (3D city, street view extras, datasets) was closed on 2026-10-25; those pull requests keep their branches on GitHub if any of it comes back (#376).

## Completed recently

- **A limit on every API call from one address (2026-10-25):** only the assistant had a per-address limit, so refresh spam or a script could hit the rest of `/api/*` as hard as it liked. The server now answers 429 with a wait time once one address passes 1,200 requests in a minute (`API_RATE_PER_MINUTE`, 0 turns it off). Map tiles and vehicle models are left out, and so is local development. The Cloudflare edge rule is still the owner's to set (#369).
- **Small fixes across open issues (2026-10-25):** several open issues each had one piece left. Pressing the train you follow again lets go of it (#297). Tapping a landmark building from above opens its photo (#311). Stations with four or more lines are named from zoom 14 (#186). The 2.6 MB of noise and crash data loads only when those layers can show (#368). Bus arrivals pause on an idle tab (#369). The agent keeps to getting around NYC, ignores rule changes inside tool results and caps reply length (#199). A question saved underground goes out once when the connection returns, not once per clock tick.
- **Remind me on the trip preview, and neighbourhoods by name (2026-10-25):** after a trip planned for later, the answer closes and the trip preview card stays, but that card had no Remind me button, so "tap Remind me" pointed at nothing. The preview card now has the button. Separately, a bare "Flushing" went to Flushing Bay at LaGuardia, because the address search treats a neighbourhood name as a venue. Twenty neighbourhoods newcomers ask about (Flushing, Jackson Heights, Chinatown, Sunset Park and others) now resolve to their main corner and station.
- **The answer names Remind me in the asker's language (2026-10-25):** in Spanish, the button reads "Recuérdame", but the agent still wrote "Toca Remind me", even after the prompt asked it not to. When an answer carries the button, the app now puts the button's own name for the app language into the answer text, on screen and when spoken.
- **Following a train: the view menu opens and trains glide after a hold (2026-10-25):** while following, Change view did nothing, because the menu closed whenever a line was selected and following always selects the train's line. A train held at a stop until the feed cleared it also jumped hundreds of metres in one step once released. The view menu now stays open while following, and a train that falls behind its estimate catches up at up to 35 m/s; only a gap over 1.5 km, which is a data jump, is drawn at once.
- **Remind me for trips planned ahead (2026-10-25, #418):** the demo video offers a reminder before a trip planned for tomorrow, and the app had none. A trip planned for later now has a Remind me button, on its card and under the answer, that puts the trip in the phone's own calendar with an alert 10 minutes before it leaves; the agent offers it for those trips. The owner chose this over the "never manage their time" rule, and `docs/DESIGN_RULES.md` records the exception.
- **Walks say what you pass (2026-10-25, #418):** walking answers named streets but never the places beside them, unlike the video ("on your left, next to the library"). Each walk the agent gets now lists the guide landmarks along it in order, with the hand each is on, and a turn names the landmark at its corner.
- **Landmarks you can tap, Home and Work you can save, and one place per switch (2026-10-25, #325, #313, #314, #372):** tapping a landmark badge did nothing. Now it opens a sheet with its Wikimedia photo and credit, Directions, and Save as Home / Save as Work (kept on this phone, and only while Home & Work is on in What we remember). My day lists the saved places, and one tap flies the map back to them. Lines opens at half height on a phone instead of a short peek. On the home screen, the Layers drawer no longer repeats the switches the menu row already holds.
- **"Which way out" gets the real exit (2026-10-25, #418):** asked which exit at Herald Square for the Empire State Building, the agent guessed a walk ("up Broadway about three blocks"), which was wrong. A new station exit tool picks the exit nearest the place from the station's entrance list, notes escalator outages, and returns the walk from that exit with a pin and a Show the walk button. Pinned places now show their name without the address ("Show Bryant Park").
- **Trip steps follow the app language (2026-10-25, #418):** someone asking in Spanish got Spanish answers but English trip steps ("Get off at", "Steps", "Walk / Transit / Drive"). The trip summary and the mode chips now use the app language in all eight languages. On the live site, the Spanish trip from the video now answers with the transfer, the skipped stops, what to bring and "¿Quieres empezar?", and the combination of states that used to hang the app (#419) ran with no long tasks.
- **The exit and trip scenes match the demo better (2026-10-25, #418):** exits sometimes never appeared on the map, and a trip's route didn't say where to change trains. Now exits redraw once the map settles, a walk runs from your exit to where you're going, and the exit card counts as a task, so other cards make room. The trip route labels the transfer ("Change to the 7 · Grand Central-42 St") and the stations its lines skip, in the app's language.
- **The agent knows where you are underground and finds events wider (2026-10-25, #418):** the agent used to answer "which exit?" without knowing you were at a station, and event search gave up after one try. Now the underground helper tells the agent the station and the exit you picked, trip answers read like directions in order and end by offering to start, and event search tries Tavily first, then TinyFish, widening the query when nothing comes back. Restroom and landmark answers now say the way there by streets and named places and end with "Want to start?", which draws the walk. Tavily needs `TAVILY_API_KEY` in the server's `.env`.
- **The map holds still while following (2026-10-25, #418):** the follow camera used to chase the dot from behind and turn on every update. Now it stays flat and north-up and glides only when the dot nears the screen's edge.
- **Focused lines and stations read properly (2026-10-25, #419):** a focused line used to break into gaps where it shared track with another line, and a skipped station said nothing when tapped. Now a focused line is drawn solid end to end, underground too, with only its own repairs and skips; a station panel opens with the notices that name it, sits below the menu row, and lets you tap one line's bullet to see only that line. Repeated taps on one spot step through each train and then the station. The exit card is a short strip so the map stays in view.
- **Live map fixes for judging (2026-10-25, #419):** trains on the way to their first remaining stop glide again instead of parking at it; restrooms closed by their listed hours are skipped; More scrolls what it opens into view; the locate button uses the crosshair people know from Google Maps. Every visitor now gets one question per 5 seconds, and the 20-per-3-hours window is off until the end of 26 Oct in New York, then comes back on its own.
- **The agent-first home landed:** chat bar at the bottom, menus top-left, task screens, memory on the phone (#395), followed by fixes to the map, panels, buses, answers and voice (#396 to #407).
- **Panels no longer hide what you are tracking:** the map moves its centre into the uncovered part of the screen, and the line panel docks to the side on tablets and desktops (#409, #410).
- **One place now decides who gets the screen:** an XState state machine in `src/lib/screen/screenSpace.ts`. The answer folds to a chip under menus and tasks, the line panel folds to a pill on phones, and sending a question closes menus. A test covers every pair of panels in both orders, and a browser test checks six screen sizes (#412). The rules themselves are in `docs/PDD.md`, "Screen space" (#411).
- **Agent timing is logged:** every assistant request writes one row to `core.agent_runs` in the Octo database: timing, tools used, model and outcome, never the question, the answer or a location (#406).

## In flight

**The pull request backlog was sorted on 2026-10-25 (#376, closed).** 51 old pull requests were closed: 35 whose work is already on main, and 16 from the direction before the realignment. Each has a comment saying why. The ones kept were rebased onto main with auto-merge on:

| Pull request | What it is | State |
|---|---|---|
| #415 | Held trains and feed-skipped stops from live MTA data, on the map and in the line panel; replaces #198 | Auto-merge on |
| #359 | Live View camera and compass scaffold, behind a flag (groundwork for fixing which way you face after the subway) | Auto-merge on |
| #417 | The top menu row and its dropdowns, including My day, follow the app language too | Auto-merge on |
| #378 | Docs: realign the project, hackathon writeup and research sources | Open for review |
| #232 | The release bot's release pull request | Left to the bot |

#416 (app text follows the asked language) merged on 2026-10-25.

Merged from the sort: #209, #348, #349, #394, #408, #414.

After pulling main, run `pnpm install`: main now needs `xstate`, and #349 changes vite and vitest.

## Next

1. **Finish the remaining-work list in `docs/PDD.md`** (items 1 to 9: menu row, the dropdowns, quick bar, memory summary, task-screen restyle, dead ends). Item 10, the screen-space rules, is done.
2. **Underground help that never lets you miss your exit or get lost inside a station:** count stops from the saved trip and timetable when there is no signal, and keep exit guidance ready before going down (#373).
3. **Fix the conversation length limit:** the server caps chat history at 30 messages, so a question fails with an error after about 15 exchanges.
4. **Save home and work** in My day for the daily explorer. The idea came from #327, which was closed because its code targets the old home screen.
5. **Refresh the document index:** `docs/CONTINUITY_INDEX.md` marks `AGENTS.md` and `docs/ARCHITECTURE.md` as changed since their last review. Review them, then regenerate the index with the `continuity docs render` command once the tool is installed; the index is generated, so don't edit it by hand.

## Workspace

Worktrees live outside the repository, as managed worktrees (`.continuity/config.json`). Remove a worktree once its pull request merges. On 2026-10-25 these remained:

| Worktree | Branch | Pull request |
|---|---|---|
| main checkout | `docs/project-realignment` | #378 |
| `nyc-map-agent-acs-boot` | `chore/acs-boot-wiring` | #394 |
| `nyc-map-agent-menu-contrast` | `feat/walk-orientation` | #408 |

Deleted local branches are kept as `archive/<branch-name>` tags, so nothing was lost: `git tag -l 'archive/*'` lists them, and `git switch -c <name> archive/<name>` restores one. Closed pull requests keep their branches on GitHub.

## Keeping this file current

PCM is a protocol and a writing standard, not a background service: no workflow or hook updates this file, and the `continuity` command-line tool is not installed here. The agent that merges a piece of work updates "Completed recently", "In flight" and "Next" in the same pull request, as `AGENTS.md` now asks.
