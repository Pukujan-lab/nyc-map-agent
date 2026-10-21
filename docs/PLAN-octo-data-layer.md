# Plan: Octo data layer and a reusable registry-driven dashboard

Tracking issue: [#13](https://github.com/Pukujan/nyc-map-agent/issues/13). Each workstream has its own issue. A PR closes an issue with `Closes #N` only when that work is complete and ready to merge.

## Now

| Issue | Workstream | Branch / PR |
| --- | --- | --- |
| [#2](https://github.com/Pukujan/nyc-map-agent/issues/2) | ACS multi-agent hotloader install | `chore/acs-hotload`, PR #14 |
| [#3](https://github.com/Pukujan/nyc-map-agent/issues/3) | Octo data model: raw, core and marts schemas | `feat/octo-data-layer` |
| [#4](https://github.com/Pukujan/nyc-map-agent/issues/4) | Migrations, versioning and nightly ingestion | `feat/octo-data-layer` |
| [#5](https://github.com/Pukujan/nyc-map-agent/issues/5) | Server API: sources, blocks, area, street | `feat/octo-data-layer` |
| [#6](https://github.com/Pukujan/nyc-map-agent/issues/6) | Registry-driven dashboard: unit and style dropdowns, filters, legends, guides | `feat/octo-data-layer` |

### Build order
1. Model and schema (raw / core / marts) in Octo, mapping the existing `public.nyc_*` tables through views. No drops.
2. dbmate-format migrations and a runner over Octo's SQL endpoint; marts refresh script; dbt noted for later.
3. Registry-driven incremental ingestion (TypeScript, pinned deps), about 12 months of events; nightly GitHub Actions plus manual dispatch.
4. Portable `/api` (Hono app in `server/app.ts`; Node entry `pnpm start`, also runs on Docker / Cloudflare): `/api/sources`, `/api/blocks`, `/api/area/:block`, `/api/street`. Parameterized SQL, zod validation, cache headers; handlers also run inside the Vite dev server.
5. Dashboard UI, kept as simple as today: one unit dropdown (block, NTA 2020, community district, borough), one style dropdown (filled areas, 3D columns, heatmap), filters, per-source guides and a first-run guide inside drawers. No tooltips. `VITE_DATA_BACKEND=octo|socrata`.
6. Docs: `docs/DATA_MODEL.md`, README, `.env.example`.

### Approved next
- Stylized textured 3D city and props (own issue and stacked PR, after the above).

## Backlog (open issues, not built yet)

| Issue | Item |
| --- | --- |
| [#7](https://github.com/Pukujan/nyc-map-agent/issues/7) | Walk bubble with noise and accident levels (green, yellow, orange, red); tap to expand. Reads `marts.street_stats`. |
| [#8](https://github.com/Pukujan/nyc-map-agent/issues/8) | Walk along a route with turn-by-turn steps and points of interest. |
| [#9](https://github.com/Pukujan/nyc-map-agent/issues/9) | Two leftover overlaps on 390 px mobile. |
| [#10](https://github.com/Pukujan/nyc-map-agent/issues/10) | Mapillary photo-sequence walk with block-by-block gliding, modeled on newbloomwon/neighborhoodpeas `lib/cameraChoreographer.ts` (STREET zoom 18.4, pitch 72); coverage tiles and thumbnail prefetch to fix slowness. |
| [#11](https://github.com/Pukujan/nyc-map-agent/issues/11) | Self-hosted NYC 3D buildings as static 3D Tiles. No Google photorealistic tiles: cost, and the terms forbid caching and key pooling. |
| [#12](https://github.com/Pukujan/nyc-map-agent/issues/12) | More filterable NYC datasets through the registry. |

## Rules that apply
- Prefer mature open-source libraries and thin glue over custom code; official SDKs over raw HTTP where one exists; pin versions; check license and maturity; justify each new dependency in the PR.
- UI: no clutter, no tooltips, everything in drawers and dropdowns, existing shadcn/Radix stack only.
- Octo is the only database. The Octo repository is read-only for this project.
