# Model credits

## Hero landmarks

`landmarks/*.glb` (Empire State, Chrysler, One WTC, Statue of Liberty) are low-poly massing models authored in this repository by `scripts/make-landmarks.ts` from published dimensions. They are dedicated to the public domain under CC0 1.0.

## Live vehicle models (not in git)

The 3D transit vehicles load from `/api/vehicle-models/<mode>`. Each one is a Sketchfab download (Download API), compressed with `gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 512` and simplified to under 1 MB, then published through Octo files to R2 as `vehicle-<mode>.glb`. All three are licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: re-meshed, simplified, textures resized and re-encoded.

Since #366 the app loads only the bus model; trains draw as route-coloured boxes, so the subway and rail rows below are kept for the published files' provenance.

| Slot | Model | Author | Source |
|---|---|---|---|
| subway | "New York City Subway car Type-R142" | yarankepang | https://sketchfab.com/3d-models/new-york-city-subway-car-type-r142-564c1e5ef96f4fd2b94142313c2921ea |
| bus | "SFMTA Muni New Flyer XD40" (the same bus model MTA runs, in San Francisco Muni livery) | kieranfarr | https://sketchfab.com/3d-models/sfmta-muni-new-flyer-xd40-bb7c7e5b03874961b03d4b36f6c95b1b |
| rail (LIRR and Metro-North) | "Metro North P32 New Haven Livery" (a P32AC-DM locomotive; Sketchfab had no downloadable CC LIRR or Metro-North passenger car) | Sharky (creeperwalker99) | https://sketchfab.com/3d-models/metro-north-p32-new-haven-livery-77a84223ca464f6597864b455e28de1a |
