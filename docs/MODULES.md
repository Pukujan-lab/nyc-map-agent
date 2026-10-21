# Module guide

Each feature is one module in three places:

```
src/features/<name>/index.ts      export default { id, layers, panel, chips, search, flags, routes } (FeatureModule, src/lib/features/types.ts)
src/features/<name>/layers.ts     MapLibre layers, reached ONLY through `layers: () => import("./layers")` (own chunk)
src/features/<name>/*.tsx         panel content (pushed with usePanel().showPanel), chips, search providers
server/features/<name>/routes.ts  Hono / Web-standard handlers, mounted in server/app.ts
ingest/<name>/*.sql               feature SQL (dbmate migrations stay in db/migrations)
```

Then add it to `src/features/index.ts` and give it a flag in `src/lib/flags/registry.ts`
(`tier: "basic"` for everyday features, `"advanced"` for analytics).

## Boundaries (CI: `pnpm lint:boundaries`)

- A feature imports `src/lib/**`, `src/components/ui/**` and itself, never another feature.
  Need something from another feature? Move it into `src/lib/` first (its own small PR).
- Core (`src/lib`, `src/components`, `src/pages`) does not import `src/features/<name>/` except
  through `src/features/index.ts`, or a legacy shim listed in `.dependency-cruiser.cjs` `SHIMS`.
- `three` only in the shared 3D custom layer (`src/lib/map/streetSigns.ts` / `threeLayer.ts`). deck.gl is banned.

## Moving an existing feature (do it when nobody else is editing it)

1. `git mv` its files into the three folders; fix relative imports inside them.
2. Leave a one-line re-export at the old path (`export * from "@/features/<name>/..."`) so
   other workers' open branches keep compiling; add the path to `SHIMS`.
3. Once no importer uses the shim, delete it and its `SHIMS` entry.
Keep each move its own PR; rebase on main right before merging.

## Status

| feature | state | why |
| --- | --- | --- |
| restrooms | moved (`src/features/restrooms`, `server/features/restrooms`, `ingest/restrooms`), shims at old paths | not under active edit |
| directions | not moved | `src/lib/api/routing.ts` exports `LngLat`, used by core (`DataViewContext`, `geosearch`); first lift `LngLat` into `src/lib/geo`. `RoutePanel`/`AddressCombobox` are under active edit (#49) |
| street signs | stays core | `streetSigns.ts` is the one shared three.js custom layer, not a feature; `build:sign-tiles` is part of the city-tiles pipeline |
| transit (#56), places/schools/storefronts (#55, #67), real blocks (#50, #59), camera (#47), mobile panel (#66) | build new code directly in `src/features/<name>/` | in flight by other workers |
| noise / crashes / data registry, city3d, street level, chat | not moved | core of `MapView` (1100+ lines, edited constantly); move layer installers out one at a time later |

## Performance budget (CI: `pnpm build:size && pnpm size`)

`.size-limit.json` budgets each JS chunk (brotli, ~5% headroom over today). A new feature's
`layers.ts` must stay behind `import()` so it becomes its own chunk; add a budget line for it.
Raising a limit is a deliberate change in the PR, with the reason.
