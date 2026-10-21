# Follow train camera

Tap a live train, then **Follow** in its panel. The camera rides the train's route shape (distance along the line), so it follows curves and never jumps when the feed's predicted times change: the position is re-evaluated every frame from the trip's stop times and eased toward (about 1.5 s).

## Elevated, at grade or underground

No new data. Every route shape point in `public/transit/subway.json` already carries a grade, built by `scripts/build-transit.ts` from OpenStreetMap railway ways: `tunnel=*` is underground, `bridge=*` or `layer>=1` is elevated, else at grade (smoothed along the line). `trackHeightProfile` in `model.ts` turns that into deck heights (8 m viaducts, hand-placed bridge decks, 3.5 % ramps out of portals).

The camera blends on `undergroundShare`: the share of track within 160 m of the train that is underground. Above ground the eye sits about 55 m behind and 16 m above the deck; underground it rises to about 120 m and switches to the x-ray look (ground veiled in the theme ink, buildings faded with a 0.9 s MapLibre paint transition, the line's tunnel and stations lit). Across a portal the share ramps, so the camera and the x-ray fade together.

Code: `src/features/transit/followCam.ts` (pure, tested) and `FollowTrain.tsx` (camera loop, x-ray dressing, status line, **Stop following**).
