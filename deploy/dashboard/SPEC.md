# Deploy dashboard for the NYC Map Agent

Build a single-page **deploy dashboard** for a self-hosted web application. It
shows what commit is currently live on the server, the history of deploys, the
log of any deploy, and lets the operator start a deploy or roll back to the
previous image. It is the operator's only view into the deployment pipeline.

This is one app, built in one pass. There is no existing code to preserve.

## Who uses it

One operator. They open it after pushing code, to confirm the deploy that CI
triggered succeeded, to read why one failed, or to roll back a bad release
quickly. They are technical: show them commit SHAs, image tags, durations and raw
log lines rather than friendly summaries.

## Data access — already implemented, use it

The backend exists. Do not invent routes, fields, or a different shape. All
routes are under `/deploy/api` and are same-origin; the session is an HttpOnly
cookie the browser sends automatically, so every request must use
`credentials: "include"` and no auth header.

### `GET /deploy/api/status`

```ts
type RunStatus = "running" | "succeeded" | "failed" | "rolled-back" | "interrupted";

interface Step {
  name: "fetch" | "checkout" | "build" | "swap" | "health";
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  startedAt: string | null;   // ISO 8601
  finishedAt: string | null;  // ISO 8601
}

interface Run {
  id: string;                 // e.g. "20261021T154500Z-a1b2c3d4e5f6"
  sha: string;                // full 40-char sha
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  steps: Step[];
  error: string | null;
}

interface Status {
  current: {
    sha: string;
    subject: string;          // commit subject line
    image: string;            // e.g. "nyc-map-agent:a1b2c3d4e5f6"
    health: "healthy" | "unhealthy" | "starting" | "unknown";
    deployedAt: string;
  } | null;
  running: Run | null;
  runs: Run[];                // newest first, at most 20
}
```

Returns `401 {"error":"unauthorized"}` when not logged in.

### `GET /deploy/api/deploys/:id`

Returns one `Run`. `404` when unknown.

### `GET /deploy/api/deploys/:id/log`

Server-Sent Events. Frames are:

```
data: {"line":"...","at":"2026-10-21T15:45:01Z"}

```

and the stream ends with:

```
event: done
data: {}

```

The stream replays the run's log from the beginning, then follows it live while
the run is in progress.

### `POST /deploy/api/deploy`

Body `{"sha"?: string}`. Omit `sha` to deploy the latest `origin/main`.
Returns `202 {"id":"..."}`. Returns `409 {"error":"busy"}` when a deploy is
already running.

### `POST /deploy/api/rollback`

No body. Returns `202 {"id":"..."}` or `409 {"error":"busy"}`.

### `POST /deploy/api/login`

Body `{"password":"..."}`. Sets the session cookie and returns `200 {"ok":true}`.
Returns `401 {"error":"invalid"}` on a wrong password, and `429 {"error":"rate-limited"}`
after repeated failures.

### `POST /deploy/api/logout`

No body. Clears the cookie, returns `200 {"ok":true}`.

## The app

One page, no routing library needed. Three regions stacked vertically, plus a
header. Responsive: usable down to a 390px-wide phone, but designed for a laptop.

### 1. Header

Left: the product name **NYC Map Agent — Deploys**. Right: a **Log out** button,
and a compact **auto-refresh** toggle (on by default) that re-fetches `/status`
every 5 seconds. When `running` is non-null, refresh every 2 seconds instead.

### 2. Live card

The first thing on the page. Shows:

- **Commit** — `subject` as the headline, with the short SHA (first 7 chars) in
  monospace next to it.
- **Status pill** — one of `healthy`, `unhealthy`, `starting`, `unknown`, mapped
  to a green / red / amber / grey tone. Do not invent colours; use the tone
  vocabulary that already exists in the starter's UI primitives.
- **Image** — the tag, monospace, muted.
- **Deployed** — relative time ("4 minutes ago") with the absolute timestamp in
  a tooltip or secondary line.
- **Actions** — **Deploy latest** and **Roll back to previous**. Both are
  disabled while `running` is non-null or while a request is in flight. Rolling
  back asks for confirmation first, naming the target: the previous image tag.

When `current` is `null` (nothing has been deployed yet), the card says so
plainly: "Nothing deployed yet" and offers only **Deploy latest**.

### 3. Deploy in progress

When `running` is non-null, show a panel above the history:

- The run id, the short SHA, and elapsed time counting up.
- The five steps as a horizontal stepper: `fetch`, `checkout`, `build`, `swap`,
  `health`. Each shows pending / running / succeeded / failed with its tone and
  its duration once finished.
- The live log, streaming from `/deploy/api/deploys/:id/log`, in a monospace pane
  that auto-scrolls to the bottom unless the user has scrolled up. Cap the
  rendered log at the most recent 2,000 lines so a long build does not freeze the
  page.

When the run finishes, stop the stream, refresh `/status`, and move the panel's
content into the history table.

### 4. History

A table of `runs`, newest first. Columns:

- **Started** — relative time, absolute on hover.
- **Commit** — short SHA in monospace, with `subject` if available (the API does
  not carry a subject per run, so show the SHA alone).
- **Status** — the `RunStatus` as a pill: `succeeded` green, `failed` red,
  `rolled-back` amber, `running` blue, `interrupted` grey.
- **Duration** — humanised (`42s`, `3m 12s`, `—` while running).
- **Log** — a button that selects the row.

Selecting a row opens the same log/stepper panel as section 3, in read-only mode,
titled with that run's id and SHA, streaming its log from the start. Selecting the
running row scrolls back up to the live panel instead of duplicating it.

An empty history shows: "No deploys recorded yet."

### 5. Login

When any request returns `401`, replace the page with a centred login card:

- Title **Deploy dashboard**.
- One password field, autofocused, plus a **Sign in** button.
- Submit on Enter.
- On `401`, show "Wrong password." under the field; on `429`, show "Too many
  attempts. Wait a few minutes."; on a network error, "Could not reach the deploy
  server."
- On success, reload the status and render the dashboard.

The login screen must not leak the deploy history behind it.

## Behaviour details

- **Optimistic disable.** Both action buttons disable immediately on click and
  re-enable when the request settles or the status refresh shows a run started.
- **Busy handling.** A `409` from deploy or rollback shows an inline notice:
  "A deploy is already running." and refreshes the status.
- **Errors.** A failed `/status` fetch shows a non-blocking banner with the error
  and the time of the last successful refresh. The page keeps showing the last
  known data rather than blanking.
- **Timestamps** are rendered in the viewer's local timezone; the server sends
  UTC ISO strings.
- **No polling storms.** Only one `/status` request is in flight at a time; a
  slow response delays the next tick rather than stacking.

## Visual direction

Dark-first, dense, operational. This is a tool that is looked at for ten seconds
at a time, so information density beats whitespace, and status colour is the only
strong colour on the page.

- Neutral slate background, one raised surface for cards, hairline borders.
- Monospace for SHAs, image tags, and all log text; sans-serif for everything
  else.
- Status tones carry meaning and are never used decoratively.
- No illustration, no empty-state art, no gradients.
- The log pane is the visual centre of gravity when a run is selected: give it
  room and a subtle inset background.

## Constraints

- The app is served under the path prefix `/deploy/`, so the build must work at
  that base (`base: "/deploy/"`).
- All API calls are absolute paths beginning `/deploy/api`.
- No server code, no build-time secrets, no environment variables.
- No new backend routes: the six routes above are the whole contract.

## Definition of done

- `pnpm build` (or the scaffold's equivalent) passes with no type errors.
- The login screen appears when the API answers 401, and the dashboard appears
  after a successful sign-in.
- The live card renders a `current` payload and an empty `current` payload.
- A running deploy shows the stepper and streams log lines.
- The history table renders all five statuses, and selecting a row shows that
  run's log.
- Both action buttons disable while `running` is non-null and surface a `409`.
- The layout holds at 390px wide with no horizontal scrolling of the page body
  (the log pane may scroll horizontally within itself).
