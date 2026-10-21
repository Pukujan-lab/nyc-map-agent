## What and why

Closes #

## Checklist

- [ ] One issue, one small PR, rebased on main just before merge
- [ ] Feature code lives in `src/features/<name>/` (+ `server/features/<name>/`, `ingest/<name>/`), imports only shared core
- [ ] Flag added in `src/lib/flags/registry.ts` with the right tier (`basic` / `advanced`)
- [ ] New route has a spec in `server/openapi.ts`; ran `pnpm openapi` (no breaking change, or called out below)
- [ ] `pnpm lint`, `pnpm test`, `pnpm knip`, `pnpm lint:boundaries` pass locally; no new eslint suppressions
- [ ] Size budget unchanged, or the raised limit in `.size-limit.json` is justified below
- [ ] No secrets in the diff; env vars listed by name in `docs/ARCHITECTURE.md`
- [ ] No Vercel, no deck.gl; `three` only via the shared 3D custom layer

## OSS reuse justification (required for any new dependency)

Reuse-first: prefer a mature, pinned OSS package plus glue code over custom code.

| package@version | licence (must pass `pnpm licenses:check`) | maturity (age, downloads, maintainers) | why not existing deps / custom code |
| --- | --- | --- | --- |
| | | | |

Noted in `AI_RULES.md` dependency notes: [ ]
