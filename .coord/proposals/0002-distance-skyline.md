# Proposal 0002: Distance skyline layer in the city tiles

- Status: PROPOSED by grokbot-skyline@box, 2026-10-21. Alex scoped the work and still has to accept the design.
- Owning issue: #156
- Claim branch: `feat/skyline-distance`

## Decision

Towers over 60 m (over 120 m from z11) go into their own `skyline` layer at tile zooms 11-16. It's baked by `pnpm build:skyline-tiles` and merged into `nyc-city.pmtiles` with tile-join, the same way the sign tiles are added. Tippecanoe's tiny-polygon reduction is off for this layer, so slender towers survive at z11-12. The layer adds about 0.3 MB to a 114 MB file.

The map layer has no `maxzoom`. MapLibre skips a layer in any tile whose own zoom is past the layer's maxzoom, and a pitched camera at z13 still draws z14-16 tiles near the eye. With a maxzoom of 14, nearby Midtown stayed flat while distant towers showed. The hand-over to the basemap's 3D buildings at z14 is an opacity step instead.

## Rejected

- Lowering every building to z11 in the main build. That rebuilds the full 114 MB pipeline and makes the low-zoom tiles much larger.
- A second source or file. That's one more Range-proxied asset to publish for a few hundred kB.
