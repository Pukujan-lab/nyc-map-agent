# Deploy dashboard

The operator UI served at `/deploy` on the deployment host. It is a standalone
Vite + React SPA, built and shipped by `deploy/Dockerfile.edge` and served as
static files by Caddy.

It is not part of the map app's build: `deploy/dashboard` has its own
`package.json`, its own lockfile, and is excluded from the root `tsconfig.json`,
knip and ESLint. Install and build it from this directory:

```sh
pnpm install --frozen-lockfile
pnpm run build
```

## What it talks to

Everything goes through `/deploy/api/*` on the same origin, authenticated by the
`nyc_cd_session` HttpOnly cookie:

| Call | Purpose |
| --- | --- |
| `GET /status` | Current image, running deploy, recent runs |
| `GET /deploys/:id` | One run's detail |
| `GET /deploys/:id/log` | Server-sent events: log lines, then `done` |
| `POST /deploy` | Start a deploy, optionally pinned to a sha |
| `POST /rollback` | Redeploy the previously successful image |
| `POST /login`, `POST /logout` | Session cookie management |

There is no demo mode and no offline simulation: if the API is unreachable the
dashboard shows an error banner and keeps the last known state on screen.

## Layout

- `src/lib/api.ts` — the only module that performs network I/O.
- `src/lib/types.ts` — the wire types, mirroring `deploy/cd/types.ts`.
- `src/pages/Index.tsx` — page state, polling, and the deploy/rollback actions.
- `src/components/` — presentational pieces; `src/components/ui/` is the
  shadcn/ui primitives.

Generated from an ABA build; `vite.config.ts` sets `base: "/deploy/"` so the
emitted asset URLs resolve under the Caddy `handle_path /deploy*` route.
