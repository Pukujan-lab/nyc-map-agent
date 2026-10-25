# Current repository checkpoint

<!-- continuity:current {"active_task": null, "active_task_file": null, "protocol_version": "0.1.0-draft", "schema": "project-continuity.current.v1"} -->

## Current projection

*Updated 2026-10-25. Read this first; it says where the work stands so a new agent does not have to rebuild that from branches and pull requests.*

GitHub Issues own task scope and progress; this file is a projection of them, not task authority. No Project Continuity Modules (PCM) task file is active, so `tasks/` is still empty. The build plan is [`docs/PDD.md`](../docs/PDD.md) (the product design document): what is built, what remains, how to check it and how to ship it. The design rules every screen must follow are in [`docs/DESIGN_RULES.md`](../docs/DESIGN_RULES.md).

**What the project is now.** An agent-first map of New York City: a chat and voice assistant over a clean map that helps people get around (restrooms, landmarks, subway exits, readable MTA disruptions). The realignment is described in [`PROJECT.md`](../PROJECT.md). Work from before the realignment (3D city, street view extras, datasets) was closed on 2026-10-25; those pull requests keep their branches on GitHub if any of it comes back (#376).

## Completed recently

- **The agent knows where you are underground and finds events wider (2026-10-25, #418):** the agent used to answer "which exit?" without knowing you were at a station, and event search gave up after one try. Now the underground helper tells the agent the station and the exit you picked, trip answers read like directions in order and end by offering to start, and event search tries Tavily first, then TinyFish, widening the query when nothing comes back. Restroom and landmark answers now say the way there by streets and named places and end with "Want to start?", which draws the walk. Tavily needs `TAVILY_API_KEY` in the server's `.env`.
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
