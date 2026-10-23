# Self-hosted 3D building tiles

Issue #11. NYC buildings served as static [3D Tiles](https://github.com/CesiumGS/3d-tiles) that we host ourselves, instead of Google photorealistic tiles (per-request cost, and terms that forbid caching and key pooling).

## Build one borough

```sh
pnpm build:3dtiles brooklyn      # manhattan | bronx | brooklyn | queens | staten-island
```

Writes `public/tiles/3d/<borough>/tileset.json` plus `tile_<x>_<y>.glb` files (gitignored). The script pulls Building Footprints (NYC Open Data `5zhs-2jue`), extrudes each footprint to its roof height, and groups buildings into 1 km grid tiles (`BUILD_3DTILES_CELL_M` to change). Output dir: `BUILD_3DTILES_OUT`.

Prerequisites: Node 20+, network access to data.cityofnewyork.us, optionally `SOCRATA_KEY_ID` / `SOCRATA_KEY_SECRET` to avoid throttling. No py3dtiles, tippecanoe or GDAL is needed; the GLB and tileset writers are plain TypeScript in `scripts/tiles3d-geometry.ts`. If the fetch fails the script prints this list.

## Host it

The output is plain static files. Upload the borough folder to any static host or bucket (the same place `pnpm publish:city-tiles` targets works) and serve it with CORS enabled and `.glb` as `model/gltf-binary`. Point a 3D Tiles client (CesiumJS `Cesium3DTileset.fromUrl`, or deck.gl/three `3d-tiles-renderer`) at `.../tileset.json`. Wiring a client into the app is not part of this change.

## Format notes and limits

- 3D Tiles 1.1, glTF 2.0 content directly (no b3dm), one flat level (root with grid children, `ADD` refinement, no LOD yet).
- Tileset root carries an East-North-Up to ECEF transform at the first footprint; tile geometry is in local metres.
- Heights are `height_roof` (ft) converted to metres; buildings start at z = 0 on the ellipsoid, so there is no ground elevation and no terrain alignment.
- Courtyard holes are ignored (flat roofs are drawn over them). One grey material, no textures.
- Not yet verified against a real borough or a 3D Tiles viewer; run `npx 3d-tiles-validator --tilesetFile public/tiles/3d/<borough>/tileset.json` first.
