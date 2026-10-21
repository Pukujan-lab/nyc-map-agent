# Continuous deployment for nyc-map-agent — design

**Date:** 2026-10-21
**Status:** approved in conversation; implementation plan not yet written
**Host:** `gravebuster` (`100.93.66.34`, tailnet `gravebuster.tail733a0f.ts.net`, user `yoav`)
**Public URL:** `https://nyc.design-bakery.com`

## Goal

Push to `main` → CI passes → gravebuster builds and swaps the running app with no
human step. The same host serves the app at `/` and a password-protected deploy
dashboard at `/deploy`, so the operator can see what is live, read the last build
log, redeploy, or roll back from a browser.

## Non-goals

- Data pipelines (`pnpm ingest`, tile builds, mart refreshes) stay manual.
- The CD program does not deploy itself; changing it is a manual rebuild.
- No multi-host or multi-environment support. One host, one environment.
- No blue-green swap. The swap is a few seconds of 502 on `/` during
  `docker compose up -d`; accepted for v1.
- `dist/` is still committed. Untracking it is a separate change.

## Architecture

```
Internet
   │  nyc.design-bakery.com  (Cloudflare proxy)
   ▼
Cloudflare Tunnel  study-os-cloudflared-1   (network: study-os_edge)
   │  http://nyc-map-edge:80
   ▼
nyc-map-edge   (Caddy, container)
   ├── /deploy*  ─────────────► nyc-map-cd:8081    dashboard + deploy API
   └── /*        ─────────────► nyc-map-web:8080   the map app
```

Three containers, one compose project (`name: nyc-map-agent`), one public
hostname. Only the edge container is reachable from the tunnel; `web` and `cd`
publish nothing to the host.

`/deploy*` is split at the edge rather than inside the app so the dashboard's API
(`/deploy/api/*`) can never collide with the app's own `/api/*`, and so a broken
app build still leaves the dashboard reachable for a rollback.

### Why the CD program is its own container

It needs `docker.sock` (root-equivalent host access), a git checkout, and write
access to the deploy state directory. None of that belongs in the container that
serves public traffic.

## Components

### `nyc-map-web` — the app

Built from the existing `Dockerfile` (Vite build → `pnpm start`, Hono on 8080).
Two changes:

- `Dockerfile` gains `ARG VITE_DATA_BACKEND` and `ARG MAPILLARY_TOKEN` before
  `vite build`, so the image bakes the Octo backend and the Mapillary client
  token. Both are public values; neither is a server secret.
- `server/node.ts` answers `GET /healthz` with `{"ok":true}` **before** the SPA
  fallback route, so a health check does not get `index.html`.
- `docker-compose.yml` declares a `healthcheck` that runs
  `node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`
  — `node:22-slim` has no `curl`, and `node` is already in the image.

Server secrets (`OCTO_*`, `INFERHUB_*`, `MTA_BUSTIME_KEY`, `SOCRATA_*`) arrive at
runtime via `env_file: .env`.

### `nyc-map-cd` — the deploy program

Image: `node:22-slim` + `git` + `docker-ce-cli` + compose plugin. Source lives at
`deploy/cd/` in this repo and is copied into the image.

Mounts:

| Host | Container | Mode |
| --- | --- | --- |
| `/srv/nyc-map-agent/app` | `/app` | rw — the deploy checkout |
| `/srv/nyc-map-agent` | `/work` | rw — compose file, `.env`, state |
| `/var/run/docker.sock` | `/var/run/docker.sock` | rw |

Runs `tsx deploy/cd/server.ts` on port 8081. Listens on `127.0.0.1` inside the
container and is reached only over the compose network by `nyc-map-edge`.

### `nyc-map-edge` — Caddy

Stock `caddy:2-alpine`, one Caddyfile:

```caddyfile
:80 {
  handle /deploy* {
    reverse_proxy nyc-map-cd:8081
  }
  handle {
    reverse_proxy nyc-map-web:8080
  }
}
```

Exposes the alias `nyc-map-edge` on `study-os_edge` (external network, declared in
`docker-compose.edge.yml`) for the tunnel. `web` and `cd` stay on the default
compose network only.

## Deploy pipeline

`deploy/cd/deploy.ts` runs one deploy, as a sequence of steps. Each step appends
to a per-run log file and to an in-memory ring buffer.

1. **Lock.** Create `state/deploy.lock` (`O_EXCL`, containing pid and start time).
   A lock older than 30 minutes is treated as stale and reclaimed, with a line in
   the log. A second concurrent request returns `409`.
2. **Resolve.** `git fetch origin` in `/app`, then resolve the requested ref to a
   full SHA. If the request carries a SHA, it must match `^[0-9a-f]{40}$` and must
   exist in `origin/main`'s history — anything else is `400`.
3. **Check out.** `git checkout --detach <sha>` then `git clean -xdf` (the checkout
   is CD-owned; no human work lives in it).
4. **Build.** `docker build -t nyc-map-agent:<sha12> .` with build args
   `VITE_DATA_BACKEND` and `MAPILLARY_TOKEN` from `/work/.env`.
5. **Record the previous image**, read from the running `nyc-map-web` container, so
   rollback has a target even if the new build is fine but the new code is not.
6. **Swap.** `docker compose -f /work/docker-compose.yml up -d --no-deps web` with
   `NYC_MAP_IMAGE=nyc-map-agent:<sha12>`.
7. **Health.** Poll `docker inspect --format '{{.State.Health.Status}}' nyc-map-web`
   every 2s for up to 90s. `healthy` → success. `unhealthy`, exited, or timeout →
   failure.
8. **On failure:** swap back to the previous image tag, poll health again, and
   record the run as `failed` with the build or health log tail attached.
9. **Record.** Append one JSON line to `state/deploys.jsonl`:
   `{id, sha, image, previousImage, startedAt, finishedAt, status, steps, error}`.
10. **Release the lock** in a `finally`.

Deploy ids are `YYYYMMDDTHHMMSSZ-<sha12>`, sortable and readable.

Rollback is steps 6–9 with the previous image tag; it records its own run with
`status: "rolled-back"`.

### Why the API returns immediately

Cloudflare drops requests around 100s. Builds take longer. `POST /deploy/api/deploy`
starts the pipeline, returns `202 {id}`, and the caller polls
`GET /deploy/api/deploys/:id` (or subscribes to the SSE log stream). CI polls until
the run is terminal and fails the job on `failed`.

## Auth

Three secrets, all server-side only, all in `/work/.env` (mode 600):

| Variable | Used for |
| --- | --- |
| `CD_ADMIN_PASSWORD` | dashboard login |
| `CD_SESSION_SECRET` | HMAC key for session cookies |
| `CD_DEPLOY_TOKEN` | `Authorization: Bearer` for CI and scripted deploys |

- **Dashboard:** `GET /deploy` serves a login form. `POST /deploy/api/login`
  compares the password with `crypto.timingSafeEqual` and sets
  `nyc_cd_session=<payload>.<hmac>` — HttpOnly, Secure, SameSite=Lax, 7-day expiry.
  Login is rate-limited in memory: 5 failures per IP per 15 minutes, then `429`.
- **CI:** `Authorization: Bearer <CD_DEPLOY_TOKEN>`, compared with
  `timingSafeEqual` after length check. Accepted on the deploy and rollback routes
  only.
- **Session check:** signature verified and `exp` checked on every dashboard API
  call. A tampered or expired cookie redirects to the login form.

The map app at `/` is public and unaffected.

## API surface

All under `/deploy/api`, all JSON.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/login` | password | set session cookie |
| POST | `/logout` | session | clear cookie |
| GET | `/status` | session | live SHA, image, container health, last 20 runs |
| GET | `/deploys/:id` | session | one run, including step list |
| GET | `/deploys/:id/log` | session | SSE stream of the run log; replays from the start |
| POST | `/deploy` | session or bearer | start a deploy; body `{"sha"?: string}` |
| POST | `/rollback` | session or bearer | redeploy `previousImage` |

## Dashboard

One server-rendered HTML page at `/deploy` after login — no framework, no build
step, so the CD container stays small and cannot break the app's bundle budget.

Shows: current commit (short SHA + subject + deploy time), container health, a
table of the last 20 runs (id, SHA, status, duration), a log pane that streams over
SSE for the selected run, and two buttons — **Deploy latest** and **Roll back**.
Buttons are disabled while a run is in progress and reflect the `409` if a run
starts elsewhere.

## Configuration

`deploy/.env.example` documents every variable:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEB_HOST_PORT` | none | not published; kept only if a local probe is needed |
| `CD_ADMIN_PASSWORD` | — | dashboard password |
| `CD_SESSION_SECRET` | — | 32+ random bytes, hex |
| `CD_DEPLOY_TOKEN` | — | CI bearer token |
| `NYC_MAP_IMAGE` | `nyc-map-agent:local` | image tag for `web` |
| `VITE_DATA_BACKEND` | `octo` | baked into the bundle |
| `MAPILLARY_TOKEN` | — | baked into the bundle |
| `OCTO_*`, `INFERHUB_*`, `MTA_BUSTIME_KEY`, `SOCRATA_*` | — | runtime app secrets |

## Repository changes

| Path | Change |
| --- | --- |
| `Dockerfile` | add the two build `ARG`s |
| `server/node.ts` | add `/healthz` before the SPA fallback |
| `deploy/docker-compose.yml` | new: `web`, `cd`, `edge` |
| `deploy/docker-compose.edge.yml` | new: joins `study-os_edge`, alias `nyc-map-edge` |
| `deploy/Caddyfile` | new: `/deploy*` split |
| `deploy/Dockerfile.cd` | new: CD image |
| `deploy/cd/*.ts` | new: server, auth, deploy pipeline, state store |
| `deploy/cd/*.test.ts` | new: unit tests |
| `deploy/.env.example` | new |
| `deploy/PROJECT.json` | new: server-management metadata contract |
| `deploy/README.md` | new: bootstrap and recovery runbook |
| `tsconfig.json` | add `deploy` to `include` |
| `knip.json` | add `deploy/**/*.ts` to `project`, `deploy/cd/server.ts` to `entry` |
| `.github/workflows/ci.yml` | add the `deploy` job |

`.dependency-cruiser.cjs` is unchanged: it scans `src server api scripts`, so the
module-boundary rules do not apply to `deploy/`.

## CI

A job appended to `ci.yml`:

```yaml
deploy:
  needs: [check, size, deps, lint, api, e2e]
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  timeout-minutes: 30
  concurrency: { group: deploy-main, cancel-in-progress: false }
  steps:
    - POST /deploy/api/deploy with the pushed SHA → capture id
    - poll /deploy/api/deploys/<id> every 10s → exit non-zero unless status is "succeeded"
```

The token is the repository secret `NYC_DEPLOY_TOKEN`, identical to
`CD_DEPLOY_TOKEN` on the server. PRs never deploy. A failed deploy fails the
workflow run, so a red check on `main` is visible in GitHub.

## Bootstrap (manual, once)

1. `git clone https://github.com/Pukujan/nyc-map-agent /srv/nyc-map-agent/app`
2. Copy `.env` (app secrets) and `deploy/.env.example` → `/srv/nyc-map-agent/.env`,
   add the three `CD_*` values, `chmod 600`.
3. `cd /srv/nyc-map-agent && docker compose -f app/deploy/docker-compose.yml -f app/deploy/docker-compose.edge.yml up -d`
4. `curl -sI https://nyc.design-bakery.com/healthz` → `200`
5. Set the `NYC_DEPLOY_TOKEN` repository secret.
6. Merge a trivial commit to `main` and watch CI deploy it.

Steps 1–4 need a human because nothing is deployed yet; after that, app deploys are
automatic. CD-program changes need steps 3–4 repeated.

## Failure handling

| Failure | Behaviour |
| --- | --- |
| Build fails | old image stays live, run recorded `failed` with the build log |
| New container unhealthy | automatic swap back, run recorded `failed` |
| Rollback target missing (first ever deploy) | run recorded `failed`, nothing swapped |
| Two deploys at once | second gets `409`; CI's `concurrency` group prevents this in practice |
| CD container restart mid-deploy | stale lock reclaimed after 30 min; the run stays `running` in the log and is marked `interrupted` on next start |
| Docker daemon down | step fails with the daemon error; run recorded `failed` |
| Disk pressure during build | build fails; the old image is still live. Prune is manual |

## Testing

Unit (`vitest`, no Docker needed):

- session sign/verify: round trip, tampered payload, expired, wrong key
- bearer check: correct, wrong, missing, wrong length
- SHA validation: full SHA accepted, branch names and short SHAs rejected
- state store: append and read back, malformed line skipped
- lock: acquire, second acquire fails, stale lock reclaimed, release
- health poll: healthy on first try, unhealthy, timeout (injected `inspect`)

Integration, manual, recorded in the runbook:

- one full deploy through the dashboard
- one rollback
- one deliberately broken commit on a throwaway branch, confirming automatic
  rollback and a `failed` run

CI keeps running the existing checks; the new code is covered by `typecheck`,
`lint`, `knip`, and `test` like everything else.

## Rollout

1. Land the repo changes with the deploy job **disabled** (`if: false` guard) and
   bootstrap by hand.
2. Deploy once manually through the dashboard.
3. Enable the CI job, push a trivial commit, confirm it deploys.
4. Remove the guard.

## Verified preconditions (2026-10-21)

- `nyc.design-bakery.com` → CNAME → `58bfc693-…cfargotunnel.com`, proxied.
- Tunnel ingress rule 12: `nyc.design-bakery.com` → `http://nyc-map-edge:80`.
- The tunnel resolves `nyc-map-edge` and currently returns 502 only because that
  container does not exist yet.
- `INFERHUB_API_KEY` added to the project `.env` and verified against
  `https://api.inferhub.dev/v1/models` (200).
- The Cloudflare token on disk can write DNS for `design-bakery.com` but cannot
  edit tunnel configuration. It is not needed: the hostname is already in place.
