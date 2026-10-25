# Current repository checkpoint

<!-- continuity:current {"active_task": null, "active_task_file": null, "protocol_version": "0.1.0-draft", "schema": "project-continuity.current.v1"} -->

## Current projection

*Updated 2026-10-25. Read this first; it says where the work stands so a new agent does not have to rebuild that from branches and pull requests.*

GitHub Issues own task scope and progress; this file is a projection of them, not task authority. No Project Continuity Modules (PCM) task file is active, so `tasks/` is still empty. The build plan is [`docs/PDD.md`](../docs/PDD.md) (the product design document): what is built, what remains, how to check it and how to ship it. The design rules every screen must follow are in [`docs/DESIGN_RULES.md`](../docs/DESIGN_RULES.md).

**What the project is now.** An agent-first map of New York City: a chat and voice assistant over a clean map that helps people get around (restrooms, landmarks, subway exits, readable MTA disruptions). The realignment is described in [`PROJECT.md`](../PROJECT.md). Work from before the realignment (3D city, street view extras, datasets) is mostly in old open pull requests; see "Open pull request backlog" below.

## Completed recently

- **The agent-first home landed:** chat bar at the bottom, menus top-left, task screens, memory on the phone (#395), followed by fixes to the map, panels, buses, answers and voice (#396 to #407).
- **Panels no longer hide what you are tracking:** the map moves its centre into the uncovered part of the screen, and the line panel docks to the side on tablets and desktops (#409, #410).
- **One place now decides who gets the screen:** an XState state machine in `src/lib/screen/screenSpace.ts`. The answer folds to a chip under menus and tasks, the line panel folds to a pill on phones, and sending a question closes menus. A test covers every pair of panels in both orders, and a browser test checks six screen sizes (#412). The rules themselves are in `docs/PDD.md`, "Screen space" (#411).
- **Agent timing is logged:** every assistant request writes one row to `core.agent_runs` in the Octo database: timing, tools used, model and outcome, never the question, the answer or a location (#406).

## In flight

| Pull request | What it is | State |
|---|---|---|
| #408 | Street, nearby places and an arrival message in the trip preview | Auto-merge on; blocked by the bundle-size check |
| #394 | Every agent gets the stack's boot steps and stops stale dev servers | Open, one failing check |
| #388 | Trip previews don't auto-play; restart on another option | Open, two failing checks |
| #378 | Docs: realign the project around the chat agent | Open; the main checkout has uncommitted edits to `PROJECT.md` and a new `docs/HACKATHON_WRITEUP.md` on this branch |

## Next

1. **Finish the remaining-work list in `docs/PDD.md`** (items 1 to 9: menu row, the dropdowns, quick bar, memory summary, task-screen restyle, dead ends). Item 10, the screen-space rules, is done.
2. **Underground help that never lets you miss your exit or get lost inside a station:** count stops from the saved trip and timetable when there is no signal, and keep exit guidance ready before going down (#373).
3. **Fix the conversation length limit:** the server caps chat history at 30 messages, so a question fails with an error after about 15 exchanges.
4. **Clear the pull request backlog** (#376), below.
5. **Refresh the document index:** `docs/CONTINUITY_INDEX.md` marks `AGENTS.md` and `docs/ARCHITECTURE.md` as changed since their last review. Review them, then regenerate the index with the `continuity docs render` command once the tool is installed; the index is generated, so don't edit it by hand.

## Open pull request backlog

There are about 60 open pull requests (#183 to #408). Most predate the realignment, and #395 already brought much of their work into main. Only #408 has auto-merge on, so the rest will not merge by themselves. At least 12 conflict with main and several fail a check. Each needs one of three outcomes: rebase and merge, close as already covered by main, or close as the old direction. Issue #376 tracks this; do it before new feature work.

## Workspace

Worktrees live outside the repository, as managed worktrees (`.continuity/config.json`). On 2026-10-25 the finished ones were removed; four remain:

| Worktree | Branch | Pull request |
|---|---|---|
| main checkout | `docs/project-realignment` | #378 |
| `nyc-map-agent-acs-boot` | `chore/acs-boot-wiring` | #394 |
| `nyc-map-agent-menu-contrast` | `feat/walk-orientation` | #408 |
| `.worktrees/trip-sim` | `feat/trip-sim-restart` | #388 |

Local branches whose work is already in main were deleted. Branches that existed only on the owner's machine were deleted after being kept as local `archive/<branch-name>` tags, so nothing was lost (`git tag -l 'archive/*'` lists them, and `git switch -c <name> archive/<name>` restores one). The remaining local branches each have an open pull request.

## Keeping this file current

PCM is a protocol and a writing standard, not a background service: no workflow or hook updates this file, and the `continuity` command-line tool is not installed here. The agent that merges a piece of work updates "Completed recently", "In flight" and "Next" in the same pull request, as `AGENTS.md` now asks.
