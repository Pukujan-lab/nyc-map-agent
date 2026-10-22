# nyc-city-pilot.pmtiles

Built by `scripts/build-city-tiles.ts` from NYC Open Data (public, NYC Open Data Terms of Use):
Building Footprints 5zhs-2jue, MapPLUTO 64uk-42ks, 2015 Street Tree Census uvpi-gqnh,
Hydrants 5bgh-vtsn, City Bench Locations kuxa-tauh, Mobile Telecommunications Franchise
Pole Reservation Locations tbgj-tdd6 (street-light poles reserved for small cells; a subset of all poles).
Packed with tippecanoe 2.53.0 (BSD-2-Clause).

The `signs` layer (corner street-name signs: names a/b, bearings ba/bb) is added by
`scripts/build-sign-tiles.ts` from NYC DCP LION 25C (https://www.nyc.gov/content/planning/pages/resources/datasets/lion),
public NYC open data, processed with DuckDB spatial (MIT).
