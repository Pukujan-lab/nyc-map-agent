# Data APIs (NYC Open Data, Socrata SODA)

- No key is needed for light use. For heavier pulls, get a free app token at https://data.cityofnewyork.us/profile/edit/developer_settings and send it as the header `X-App-Token`.
- Query language: SoQL, passed as URL parameters (`$select`, `$where`, `$group`, `$order`, `$limit`, `$offset`). Docs: https://dev.socrata.com/docs/queries/
- Formats: `.json`, `.csv`, and `.geojson` on the same resource URL.
- Paging: `$limit` up to 50000 per request; page with `$offset` and a stable `$order`.
- Timestamps are NYC local time with no zone suffix.

---

## 1. 311 Service Requests (noise complaints)
- Dataset: `erm2-nwe9`. Updated daily. Covers 2010 to now.
- Page: https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9
- API: `https://data.cityofnewyork.us/resource/erm2-nwe9.json`
- Noise filter: `complaint_type like 'Noise%'`
- Complaint types and counts since 2025-10-01 (checked 2026-10-19):
  - Noise - Residential: 452,031
  - Noise - Street/Sidewalk: 184,145
  - Noise - Commercial: 64,079
  - Noise: 63,874
  - Noise - Vehicle: 54,358
  - Noise - Helicopter: 12,785
  - Noise - Park: 8,877
  - Noise - House of Worship: 2,916
- Key fields: `unique_key`, `created_date`, `closed_date`, `complaint_type`, `descriptor` (e.g. Loud Music/Party, Loud Talking), `location_type`, `incident_address`, `street_name`, `cross_street_1`, `cross_street_2`, `incident_zip`, `borough`, `community_board`, `council_district`, `police_precinct`, `bbl`, `latitude`, `longitude`, `status`, `resolution_description`
- Note: some street complaints have coordinates but `borough` set to `Unspecified`. Use the coordinates, not the borough field, to place them.

Example queries:
```
# Last 12 months of noise with coordinates (page with $offset)
https://data.cityofnewyork.us/resource/erm2-nwe9.json?$select=unique_key,created_date,complaint_type,descriptor,location_type,incident_address,latitude,longitude&$where=complaint_type like 'Noise%25' AND created_date > '2025-10-19' AND latitude IS NOT NULL&$order=unique_key&$limit=50000&$offset=0

# Counts by type
https://data.cityofnewyork.us/resource/erm2-nwe9.json?$select=complaint_type,count(*)&$where=complaint_type like 'Noise%25' AND created_date > '2025-10-19'&$group=complaint_type

# Count by hour of day for one ZIP
https://data.cityofnewyork.us/resource/erm2-nwe9.json?$select=date_extract_hh(created_date) as hour,count(*)&$where=complaint_type like 'Noise%25' AND incident_zip='11237'&$group=hour&$order=hour
```

---

## 2. Motor Vehicle Collisions - Crashes
- Dataset: `h9gi-nx95` (NYPD). One row per police-reported crash.
- Page: https://data.cityofnewyork.us/Public-Safety/Motor-Vehicle-Collisions-Crashes/h9gi-nx95
- API: `https://data.cityofnewyork.us/resource/h9gi-nx95.json`
- Freshness: as of 2026-10-19 the newest crash is from 2026-06-11, so the data is about 4 months behind. Use the newest 12 months available.
- Volume from 2025-06-01 to 2026-06-11: 87,697 crashes, 51,168 people injured, 218 killed.
- Key fields: `collision_id`, `crash_date`, `crash_time`, `borough`, `zip_code`, `latitude`, `longitude`, `on_street_name`, `cross_street_name`, `off_street_name`, `number_of_persons_injured`, `number_of_persons_killed`, `number_of_pedestrians_injured`, `number_of_pedestrians_killed`, `number_of_cyclist_injured`, `number_of_cyclist_killed`, `number_of_motorist_injured`, `number_of_motorist_killed`, `contributing_factor_vehicle_1` to `_5`, `vehicle_type_code1` to `5`

Related tables, joined on `collision_id`:
- Vehicles `bm4k-52h4`: https://data.cityofnewyork.us/resource/bm4k-52h4.json
- Person `f55k-p6yu`: https://data.cityofnewyork.us/resource/f55k-p6yu.json

Example queries:
```
# Crashes with injuries in Brooklyn, newest first
https://data.cityofnewyork.us/resource/h9gi-nx95.json?$where=borough='BROOKLYN' AND number_of_persons_injured > 0 AND latitude IS NOT NULL&$order=crash_date DESC&$limit=50000

# Intersections with the most cyclist injuries
https://data.cityofnewyork.us/resource/h9gi-nx95.json?$select=on_street_name,cross_street_name,sum(number_of_cyclist_injured) as cyclists&$where=crash_date > '2025-06-01' AND cross_street_name IS NOT NULL&$group=on_street_name,cross_street_name&$order=cyclists DESC&$limit=20

# Top contributing factors
https://data.cityofnewyork.us/resource/h9gi-nx95.json?$select=contributing_factor_vehicle_1,count(*) as n&$where=crash_date > '2025-06-01'&$group=contributing_factor_vehicle_1&$order=n DESC&$limit=15
```

---

## 3. Neighborhood boundaries: 2020 Neighborhood Tabulation Areas (NTAs)
- Dataset: `9nt8-h7nd`
- GeoJSON: `https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson`
- Fields: `nta2020` (code), `ntaname`, `ntaabbrev`, `ntatype`, `boroname`, `borocode`, `cdta2020`, `cdtaname`, `the_geom` (multipolygon)
- Use these to give each point a neighborhood and to shade neighborhoods on the zoomed-out view.

---

## 4. Streets and basemap: OpenStreetMap
- Standard tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Follow the tile usage policy at https://operations.osmfoundation.org/policies/tiles/ and credit "© OpenStreetMap contributors". For a public demo, a hosted OSM-based tile provider is safer.
- Street and building data: Overpass API at `https://overpass-api.de/api/interpreter` (streets are `highway=*`, buildings are `building=*`, and many have `height` or `building:levels` for real 3D buildings).
- Address search (geocoding) for the F6 address score card: NYC Geoclient (https://api-portal.nyc.gov/), which needs a free key, or Nominatim at `https://nominatim.openstreetmap.org/search` (1 request per second, with a User-Agent).

---

## 5. Other 311 issue types worth adding later
The same 311 dataset (`erm2-nwe9`) covers many other issue types. Filter `complaint_type` the same way as for noise, for example `Illegal Parking`, `Blocked Driveway`, `HEAT/HOT WATER`, `Street Condition`, `Rodent`, and `Abandoned Vehicle`.
