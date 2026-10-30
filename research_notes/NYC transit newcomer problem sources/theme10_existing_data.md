# Theme 10: Existing data that could power an NYC transit helper, and its limits

Method note: every URL below was opened with a fetch (or came back in a search result; those are marked "search result only" and carry only a snippet). Dataset metadata for NYC Open Data and data.ny.gov was read from the portals' machine-readable `api/views/<id>.json` endpoints, which return the publisher's own description and caveats. Two MTA specs were PDFs; I read them locally. The web-search budget ran out mid-session, so a few topics (NYC DOT/NYC Emergency Management advisories feeds, MTA/NYC OTP instances, LIRR/Metro-North realtime detail) are in Gaps.

## 1. MTA static and real-time feeds

### Takeaway
MTA publishes free static GTFS, subway GTFS-Realtime (arrival predictions per stop, not track positions), a separate alerts feed (with bracket jargon like [F]), and elevator/escalator feeds. Terms say the data is "as is" and must not be implied accurate; none of it positions a rider inside a station.

### Cited Findings

| URL | Dataset or feed | Coverage or limitation | Source type |
|---|---|---|---|
| https://www.mta.info/developers | MTA Developer Resources hub: static GTFS zips (subway regular, subway supplemented, LIRR, Metro-North, 5 borough bus + MTA Bus Co.), realtime pointers | Regular subway GTFS updated "a few times a year", excludes most temporary changes; supplemented subway GTFS updated hourly with changes for the next 7 days; LIRR/Metro-North 7-10 days of changes; bus GTFS quarterly. Port Jervis/Pascack Valley come via NJ TRANSIT. Data feeds free; MTA logos/maps/symbols need a license | Official agency |
| https://api.mta.info/ | MTA API gateway (subway/rail/alerts GTFS-RT, elevator and escalator feeds) | Fetched page returned only the title "MTA Developer Resources" (sign-in/JS app), so feed details here are not verified from this page. The nyct-gtfs library notes the subway feed host is api-endpoint.mta.info and (v2.0.0+) needs no key | Official agency (gateway) |
| https://www.mta.info/developers/terms-and-conditions | MTA data feed terms | Free but must accept terms; must host the data on a non-MTA server; if real-time data reaches users >1 minute after generation, tell users it may not be real time; data "as is" with no warranty of accuracy, completeness or timeliness and you must not state or imply it is accurate; MTA can suspend or end access without notice; no rate limit stated | Official terms |
| https://mta.info/document/134521 | "GTFS-realtime Reference for the New York City Subway" (NYCT extension spec, v1.1, dated Sept 2012; PDF) | Feed regenerated every 30 s. TripUpdate `vehicle` field "Not used". Position is only implied: the first stop-time is the stop the train is "currently approaching, stopped at or about to leave"; a stop is dropped when the train departs. Feed holds trips already underway plus unassigned trips starting in the next 30 min (trip replacement period 30 min); trips not in the realtime feed are treated as cancelled. Spec says ScheduleRelationship is not used because actual vs static trip cannot be reliably related. Document is old (originally covered only the 1-6 and Grand Central Shuttle), so check against current feed | Official spec (dated) |
| https://pypi.org/project/nyct-gtfs/ | Community Python parser of the subway GTFS-RT feeds; lists the per-line-group feed URLs (ace, bdfm, g, jz, nqrw, l, 1-7/S, SIR) | Location is stop ID plus status (STOPPED_AT / INCOMING_AT), not coordinates; remaining stops dropped after departure; A-division lines share one feed; grouping table dated Nov 2021; library page states no refresh interval. MIT licence, not affiliated with any agency | Community tool documentation |
| https://gtfs.org/documentation/realtime/reference/ | GTFS-Realtime specification (VehiclePosition, TripUpdate, Alert) | Standard: if a trip has no TripUpdate, no prediction exists (not "on schedule"); FULL_DATASET feeds overwrite earlier state. Useful to show what the format allows vs what MTA fills in | Standards body |
| https://gtfs.org/documentation/schedule/reference/ | GTFS Schedule specification | Format supports `location_type` 2 (entrance/exit), 3 (generic node), `pathways.txt`, `levels.txt`, and `wheelchair_boarding` per entrance; required levels when pathways use elevators. Whether a given agency fills pathways/levels is a separate question (not verified for MTA here). Page was truncated at 100k chars | Standards body |
| https://www.mta.info/document/90881 | "MTA GTFS Alerts Feed Documentation" (Mercury extensions, last updated Dec 2021; PDF) | Alert-only feed, GTFS-RT 2.0. IDs `lmm:alert:<id>` = unplanned disruption, `lmm:planned_work:<id>` = planned interruption (so planned work is in the same feed). Headline capped at 160 characters; text published as "en" and "en-html"; MTA route bullets and ADA icons appear as brackets, e.g. "Delays on the [F] [G] trains." (jargon a rider app must translate). `cause`, `effect`, `url` "Not currently used". Multiple impacts become separate entities | Official spec |
| https://mta.info/developers/service-status-box | How to build a Service Status box from the alerts feed | `sort_order` higher = more severe (Slow Speeds 16, Delays 22, Suspended 39); `alert_type` is the title; `display_before_active` null means not shown in a status box (e.g. staircase repairs). Page says simplified view can misrepresent long lines and minor disruptions may have no alert | Official guide |
| https://catalog.data.gov/dataset/mta-service-alerts-beginning-april-2020 | MTA Service Alerts: Beginning April 2020 (data.ny.gov id 7kct-peq7, per search snippet) | Historical archive of scheduled and unscheduled events across subway, bus, commuter rail, bridges and tunnels; JSON/XML/CSV; first published May 1 2024, last updated Sept 25 2026; page states no update schedule or field list. Useful for "how often does X line have disruptions", not live | Open data catalog (Data.gov mirror) |
| https://www.mta.info/developers/display-elevators-NYCT | Developer guide to elevator and escalator feeds | Two feeds: Equipment (what exists, station, in-station location, lines served, `alternativeeroute`) and Current Outages (reason, estimated return), joined on `equipmentno`; `ADA` flag shows if unit is part of an accessible pathway. Page warns an in-service elevator may reach a mezzanine with no step-free path to the platform. Format, update frequency and rate limits not stated on page | Official guide |
| https://www.mta.info/elevator-escalator-status | MTA Elevator and Escalator Status page | Covers NYCT subway, Metro-North and LIRR. Units with an "X" in the ID are third-party maintained and "back-in-service times for them are default estimates" | Official service page |
| https://www.elevatoruptime.com/building/91137dec-830d-4db0-b931-72fc529aa8cf/md | Third-party station elevator/escalator tracker (Jay St-MetroTech example) | Built from MTA's feed plus its own records that only start Oct 16 2026; cites MTA monthly availability data at data.ny.gov id rc78-7x78; own disclaimers: may be out of date, contractor not verified. Shows what a feed-derived history can and cannot say | Third-party aggregator |
| https://catalog.data.gov/dataset/mta-subway-stations | MTA Subway Stations (data.ny.gov id 39hk-dx4f, per search snippet) | All subway and Staten Island Railway stations: location, station and complex IDs, GTFS Stop ID, services, structure type, CBD flag, ADA status. Published June 17 2024, last updated Oct 21 2026; JSON/XML/CSV/KML/KMZ/GeoJSON; no licence stated on catalog page | Open data catalog (Data.gov mirror) |
| https://catalog.data.gov/dataset/mta-subway-stations-and-complexes | MTA Subway Stations and Complexes (data.ny.gov id 5f5g-n3cz, per search snippet) | Same station data aggregated by complex (a complex = several stations linked underground). Last updated Oct 21 2026. Station-level only; no map of the passages between stations | Open data catalog (Data.gov mirror) |
| https://catalog.data.gov/dataset/mta-subway-accessible-station-platform-availability-beginning-2018 | MTA Subway Accessible Station Platform Availability: Beginning 2018 (id thh2-syn7 per search snippet) | Monthly percent of time the average platform at accessible stations is step-free usable; last updated Sept 25 2026. Monthly average across a system, not per-trip live availability | Open data catalog (Data.gov mirror) |
| https://data.ny.gov/api/views/i9wp-a4ja.json | MTA Subway Entrances and Exits: 2024 (id i9wp-a4ja) | One row per entrance/exit with coordinates, entrance type, `Entry Allowed`/`Exit Allowed`, complex and station IDs, GTFS Stop ID, daytime routes. Dataset summary says "Static - Not Updated"; rows last updated Dec 5 2025. No licence stated. Gives where the street door is, not the route inside the station or which exit is nearest a destination; no accessibility column in the listed fields | Open data portal (metadata) |
| https://data.ny.gov/Transportation/MTA-Subway-Entrances-and-Exits-2024/i9wp-a4ja | Landing page of same dataset | Fetch returned only title and site chrome; use the .json above for facts | Open data portal |
| https://bustime.mta.info/wiki/Developers/Index | MTA Bus Time developer APIs (SIRI, OneBusAway Discovery, GTFS-RT) | API key required (page says delivered "within half an hour"); no rate limit stated; page calls the system "a pilot project". Bus only; GTFS-RT details not on this page | Official docs |
| https://www.mta.info/developers (LIRR/MNR row) | LIRR and Metro-North realtime via GTFS-RT with MTARR proto extension | Hub lists the extension proto at github.com/OneBusAway/onebusaway-gtfs-realtime-api (raw .proto URL). I did not open the proto or confirm update frequency | Official agency |
| https://github.com/OneBusAway/onebusaway-gtfs-realtime-api | Repo that hosts GTFS-RT extension protos referenced by MTA | README only mentions OneBusAway and NYCT extensions; could not confirm MTARR or service-status protos from the repo front page | Open source repo |

### Inferences
- The subway feed gives "next stop plus status", so an app can say "train approaching 14 St" but not "train is between stations" or "train is crowded"; no MTA source above provides rider position inside a station or on the platform.
- Alerts text is written for MTA's own icon rendering ("[F] [G]") and its `cause`/`effect` fields are unused, so a plain-language, readable disruption layer has to be built by parsing header/description text, not read from structured fields.
- Entrances dataset is static and has no stated accessibility or "which exit faces X" attribute, so exit guidance needs OSM tags, Mapillary imagery or hand-curation on top.
- Terms say data must be hosted off MTA servers and users told it may not be real time if >1 minute stale; this shapes the architecture (a caching proxy with a timestamp shown to users).

### Gaps
- No page I opened states the subway GTFS-RT refresh rate today (only the 2012 spec says 30 seconds); no MTA source I opened publishes accuracy statistics for predictions.
- I did not confirm the actual elevator/escalator endpoint URLs, response format or refresh rate (the guide omits them).
- A separate "planned service changes" dataset on data.ny.gov was not found; planned work appears in the alerts feed as `lmm:planned_work`.
- LIRR and Metro-North GTFS-RT feed specifics and update frequency not verified.

## 2. NYC Open Data and city geodata

### Takeaway
The city publishes useful, free datasets (restrooms, landmarks, footprints, ramps, trees, PLUTO, collisions, 311), but several are snapshots, have many missing fields, or have stated warnings against using them for exactly what a newcomer helper would want (live restroom availability, ADA compliance).

### Cited Findings

| URL | Dataset or feed | Coverage or limitation | Source type |
|---|---|---|---|
| https://data.cityofnewyork.us/api/views/i7jb-7jku.json | Public Restrooms (i7jb-7jku) | 1,066 records (per publisher stats); fields include hours, accessibility, type, changing stations, lat/lon. Updated about twice a year plus status changes, not automated; last rows update June 27 2025. Publisher warns it may not reflect real-time conditions. Missing values: Accessibility empty in 175 records, Restroom Type 144, Hours 93, Open 73. Operator spelling inconsistencies. No licence stated in metadata | Open data portal (metadata) |
| https://data.cityofnewyork.us/City-Government/Public-Restrooms/i7jb-7jku | Landing page, same dataset | Fetch returned only title/navigation | Open data portal |
| https://data.cityofnewyork.us/api/views/erm2-nwe9.json | 311 Service Requests from 2020 to Present (erm2-nwe9) | Updated daily; "only service requests that can be directed to specific city agencies"; expected value lists are "not exhaustive" and change over time; 2010-2019 is a separate dataset. Metadata timestamp is recent (the fetch summary misread it as 2027). Complaint data, not a live-service status | Open data portal (metadata) |
| https://data.cityofnewyork.us/api/views/h9gi-nx95.json | Motor Vehicle Collisions - Crashes (h9gi-nx95) | NYPD police-reported crashes (injury, death or >= $1,000 damage); preliminary and may change; about 691,000 records lack borough and about 241,000 lack coordinates; ~7,591 rows have lat/lon of 0. Metadata said daily updates but automated updates were paused (last rows update 2026-06-15) | Open data portal (metadata) |
| https://data.cityofnewyork.us/api/views/buis-pvji.json | Individual Landmark Sites (id buis-pvji; LPC) | 1,532 records; updated every 6 months (not automated); only individual landmarks, not historic districts, scenic or interior landmarks; non-lot landmarks such as bridges use dummy BBLs; REPORT_URL empty for all rows; 67 records lack coordinates | Open data portal (metadata) |
| https://data.cityofnewyork.us/api/views/5zhs-2jue.json | Building Footprints (id 5zhs-2jue; OTI) | About 1.08 million buildings; updated weekly (rows updated 2026-10-19); mostly photogrammetric geometry (~1.0M) vs ~75k manually digitized; BIN unknown when last six digits are zero; NAME field effectively empty (~1,080,698 of 1,082,946 null) so no building names | Open data portal (metadata) |
| https://data.cityofnewyork.us/api/views/64uk-42ks.json | PLUTO (Primary Land Use Tax Lot Output), version 26v2 | 70+ fields per tax lot from DCP; zero in floor-area fields can mean unavailable; zoning district shows only the largest-share district; "park" lots not for open-space measurement; lot area may include unbuilt street beds | Open data portal (metadata) |
| https://data.cityofnewyork.us/api/views/ufzp-rrqu.json | Pedestrian Ramp Locations (id ufzp-rrqu) | About 217,700 ramps, collected by Cyclomedia 2017-2020; last rows update Oct 2021, not automated; publisher states measurements are "not indicative of whether a particular ramp is compliant" with ADA; defective warning surface condition "Missing" for ~129,000 records; placeholder values like 999.0 | Open data portal (metadata) |
| https://data.cityofnewyork.us/api/views/uvpi-gqnh.json | 2015 Street Tree Census (id uvpi-gqnh) | 666,134 trees counted May 2015-Oct 2016; historical snapshot (rows updated 2017), health rating is volunteer perception; current population lives in Parks' ForMS datasets, not this one | Open data portal (metadata) |
| https://data.cityofnewyork.us/api/views/9nt8-h7nd.json | 2020 Neighborhood Tabulation Areas (id 9nt8-h7nd; DCP) | Updated quarterly (version 26b); statistical units "not intended to definitively represent neighborhoods"; includes parks/airports/cemeteries flagged by NTAType | Open data portal (metadata) |
| https://data.cityofnewyork.us/api/views/i4gi-tjb9.json | DOT Traffic Speeds (id i4gi-tjb9) | Road-segment speeds updated "several times per minute"; about 104 million rows; many rows have speed 0 (~12 million) and status -101 (~20.5 million) with codes not explained in JSON; inconsistent labels. Covers vehicle speeds on road links, not transit or pedestrian conditions | Open data portal (metadata) |
| https://dev.socrata.com/docs/app-tokens.html | Socrata (SODA) API throttling and app tokens, used by data.cityofnewyork.us and data.ny.gov | Requests without a token share an IP-based pool and may be throttled (HTTP 429); with an app token the page says it does not currently throttle unless abusive | Platform docs |
| https://www.nyc.gov/opendata/get-started/what-is-open-data- | NYC Open Data Law overview | "Open by default" since March 7 2012; page states no licence terms and no accuracy/liability statement, links to a general Terms of use page I did not open | Government page |

### Inferences
- Restroom data is a twice-yearly snapshot with empty hours/accessibility for a sizeable share of rows; a helper should show "last checked" and fallback to OSM or user reports rather than promise "open now".
- Ramp and tree datasets are old (2017-2020 / 2015) and the ramp publisher explicitly disclaims ADA compliance; they can hint at curb access but cannot be used as accessibility guarantees.
- Collisions and 311 are historical/complaint data useful for "hotspot" context, not for live safety or service status.

### Gaps
- Licence: none of the NYC Open Data metadata JSONs I read state a licence name; the general NYC terms-of-use page was not opened.
- Pedestrian-related datasets beyond ramps (e.g. sidewalk widths, subway-adjacent POIs) were not checked.
- Dataset IDs for the NYC DOT, Parks and LPC alternatives (e.g. historic districts) were not searched because the search budget ran out.

## 3. OpenStreetMap, Overture, imagery and map rendering

### Takeaway
OSM can fill in entrance, toilet and wheelchair tags with open licensing but coverage is volunteer-driven and uneven; indoor mapping is not standardized well enough to route inside stations. Free vector map hosting (OpenFreeMap + MapLibre) exists with no key.

### Cited Findings

| URL | Dataset or feed | Coverage or limitation | Source type |
|---|---|---|---|
| https://wiki.openstreetmap.org/wiki/Tag:railway=subway_entrance | `railway=subway_entrance` tagging | Entrance nodes with optional `ref`, `name`, `wheelchair=yes/no`; `oneway=yes` for entrance-only/exit-only; entrance links to station via `public_transport=stop_area` relation. Page says mapped entrances help routing name the exit nearest your destination because GPS often fails underground; no level tagging described on the page | Community wiki |
| https://wiki.openstreetmap.org/wiki/Key:toilets | `amenity=toilets` and `toilets:*` tags | `toilets:wheelchair=yes/no/limited`, `toilets:access`, `toilets:unisex`; fee/opening hours/changing table guidance is thin or only via general keys | Community wiki |
| https://wiki.openstreetmap.org/wiki/Key:wheelchair | `wheelchair=*` tag | Values yes/limited/no/designated; "no default value", missing tag does not mean inaccessible; only tag when sure; for platforms and entrances meaning differs (limited = needs help) | Community wiki |
| https://wiki.openstreetmap.org/wiki/Indoor_Mapping | Indoor mapping schemes (Simple Indoor Tagging, `level`, `highway=elevator`) | Level values vary by region (0 vs 1 ground floor); mapped coverage is uneven; several apps lack indoor support; routing requires modelling levels, stairs, escalators and elevators | Community wiki |
| https://www.openstreetmap.org/copyright | OSM licence | ODbL: credit OpenStreetMap contributors and state data is under ODbL; derived databases must be shared under the same licence | Official foundation page |
| https://operations.osmfoundation.org/policies/tiles/ | OSM standard tile usage policy | tile.openstreetmap.org only for light use: no bulk download or offline use, must show attribution, identify with a User-Agent, no SLA, may be blocked without notice. Not suitable as a production tile source for an app | Official foundation policy |
| https://docs.overturemaps.org/ | Overture Maps (addresses, base, buildings, divisions, places, transportation) | Open data via S3/Azure and partner mirrors (BigQuery, Snowflake, etc.); landing page does not state licence terms or release cadence (points to a release calendar and attribution page I did not open) | Official docs |
| https://www.mapillary.com/developer/api-documentation | Mapillary API v4 | Token required; rate limits 60,000 entity requests/min/app, 10,000 search/min/app, tiles 50,000/day; bbox queries must be under 0.01 deg square; image radius search max 50 m. Page does not state the imagery licence | Official docs |
| https://openfreemap.org/ | OpenFreeMap hosted vector tiles | Free public instance, no API key, no stated view/request caps, commercial use allowed; MIT licensed; data from OpenStreetMap, attribution (OpenMapTiles + OSM) required; self-host supported; weekly planet builds; offline downloads capped (3,000 tiles or 50 MB, 4 parallel requests) | Project site |
| https://maplibre.org/maplibre-gl-js/docs/ | MapLibre GL JS | WebGL vector-tile renderer driven by a style document; examples show 3D terrain, 3D buildings and extruded indoor polygons; licence not stated on the page (not verified) | Project docs |

### Inferences
- OSM can supply wheelchair/entrance/toilet tags without a licence fee, but "unknown" is the common state and missing tags cannot be read as "no"; the ODbL attribution/share-alike rule affects how a combined dataset can be published.
- No source above provides a ready-made indoor routing graph for NYC stations; indoor mapping is inconsistent even where it exists in OSM.

### Gaps
- Overture licences per theme, Mapillary imagery licence and OSM coverage statistics for NYC subway entrances/toilets were not found.
- No measured count of how many NYC subway entrances in OSM carry `wheelchair` or `ref` tags.

## 4. Weather, routing and emergency information

### Takeaway
NWS and Open-Meteo give free forecast data with clear limits; OSRM, OpenTripPlanner and Valhalla are open-source routers, but routing quality depends on the data fed in, and the public OSRM demo is not for production use.

### Cited Findings

| URL | Dataset or feed | Coverage or limitation | Source type |
|---|---|---|---|
| https://www.weather.gov/documentation/services-web-api | NWS API (api.weather.gov) | No key; must send an identifying User-Agent (key planned in future); rate limit not public, retry after ~5 s; observations may lag ~20 minutes and most stations are not NWS-maintained; alerts only for past 7 days; data "intended to be open data, free to use for any purpose" | Official government docs |
| https://open-meteo.com/en/terms | Open-Meteo terms | CC-BY 4.0 data; free tier for non-commercial use only (apps with ads/subscriptions are commercial); limits <10,000 calls/day, 5,000/hour, 600/minute per IP; may block misuse without notice | Provider terms |
| https://open-meteo.com/en/docs | Open-Meteo Forecast API | No key for non-commercial; "Best match" blends models (e.g. NOAA GFS/HRRR hourly updates); 15-minute data in North America comes from HRRR, elsewhere interpolated | Provider docs |
| https://project-osrm.org/ | OSRM routing engine | Car, bicycle, foot profiles; BSD 2-clause licence; does not itself do transit routing (inferred from page listing only car/bike/foot) | Project site |
| https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy | OSRM demo server policy | No numeric limit ("Excessive use is not allowed"); needs identifying User-Agent; ODbL and OSRM attribution; no iframe embedding; best-effort, access can be withdrawn; commercial use must not be paywalled | Project wiki |
| https://docs.opentripplanner.org/en/latest/ | OpenTripPlanner 2 | Built from GTFS + OSM (+ GTFS-RT/SIRI/GBFS updaters); multimodal; GraphQL APIs; LGPL licence. You run it yourself; routing is only as good as the feeds, and (per spec) station-internal pathways only exist if the GTFS includes them | Project docs |
| https://valhalla.github.io/valhalla/ | Valhalla routing | Open-source on OSM data; multimodal time-based routes including transit and pedestrian, isochrones, map matching; MIT licence; transit support requires building the transit tiles from GTFS | Project docs |
| https://www.nyc.gov/site/em/ready/notify-nyc.page | NYC Emergency Management Notify NYC | Fetch returned 404 (page not available at this address); no confirmation that a public alerts API exists | Government page (not reachable) |

### Inferences
- A weather overlay is cheap (NWS for alerts, Open-Meteo for hourly/15-min), but Open-Meteo's free tier bars apps with ads or subscriptions, so a hackathon prototype is fine and a commercial product must pay.
- Running OTP or Valhalla with MTA GTFS gives transit trip plans from schedules; this matches what existing apps already do and still does not tell a rider which stairs or exit to use inside a complex.

### Gaps
- No live source found for NYC Emergency Management advisories (Notify NYC page 404; nothing else searched).
- MTA/NYC-run OTP instances were not located; I cannot say whether a public one exists.
- Valhalla and OTP accessibility (wheelchair) routing quality in NYC not verified.
- NYC DOT traffic speeds covers cars; no NYC DOT sidewalk/pedestrian-flow feed was checked.

## Unverified items (listed so the writer does not cite them)
- Search-result-only IDs (not opened on their own pages): data.ny.gov 39hk-dx4f (stations), 5f5g-n3cz (complexes), thh2-syn7 (platform availability), 7kct-peq7 (alerts) came from Data.gov mirror pages and search snippets; rc78-7x78 comes from the elevatoruptime page.
- Also seen only as search results: https://gtfs-rt-nyct.hexdocs.pm/gtfs_rt_nyct.html, https://cran.r-project.org/web/packages/gtfsrealtime/vignettes/service_alerts.html (NYC alert ID example "MTA NYCT_lmm:planned_work:22245"), https://council.nyc.gov/data/increasing-accessibility/ (claimed 23% of stations fully ADA accessible, summer 2019 data; snippet only), https://transitcenter.org/wp-content/uploads/2017/07/AccessDenied.pdf (snippet only).
