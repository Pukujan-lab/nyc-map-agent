-- migrate:up
-- OpenStreetMap public toilets (amenity=toilets in NYC, via Overpass, ODbL),
-- refreshed nightly by server/features/restrooms/osm.ts. The second restroom
-- source: /api/restrooms merges it with core.restrooms (the city list, last
-- updated by NYC Open Data in June 2025). access=private/no/customers rows are
-- not stored; customers-only toilets stay with core.place_toilets.
-- edited_at is the element's last OSM edit, the record's asOf.
CREATE TABLE core.osm_toilets (
  id              text PRIMARY KEY,
  name            text,
  access          text,
  fee             boolean,
  wheelchair      text,
  opening_hours   text,
  changing_table  boolean,
  unisex          boolean,
  operator        text,
  url             text NOT NULL,
  edited_at       timestamptz,
  lon             double precision NOT NULL,
  lat             double precision NOT NULL,
  refreshed_at    timestamptz NOT NULL DEFAULT now()
);

-- The city list gains each row's update time: the Socrata :updated_at the
-- nightly ingest now selects, or when the row was loaded for older rows.
CREATE OR REPLACE VIEW core.restrooms AS
SELECT facility_name AS name,
       row->>'location_type' AS location_type,
       row->>'operator' AS operator,
       row->>'status' AS status,
       row->>'hours_of_operation' AS hours,
       row->>'accessibility' AS accessibility,
       row->>'restroom_type' AS restroom_type,
       row->>'changing_stations' AS changing_stations,
       (row->>'latitude')::double precision AS lat,
       (row->>'longitude')::double precision AS lon,
       COALESCE((row->>':updated_at')::timestamptz, loaded_at) AS updated_at
FROM raw.restrooms
WHERE row->>'latitude' IS NOT NULL AND row->>'longitude' IS NOT NULL;

-- migrate:down
DROP VIEW IF EXISTS core.restrooms;
CREATE VIEW core.restrooms AS
SELECT facility_name AS name,
       row->>'location_type' AS location_type,
       row->>'operator' AS operator,
       row->>'status' AS status,
       row->>'hours_of_operation' AS hours,
       row->>'accessibility' AS accessibility,
       row->>'restroom_type' AS restroom_type,
       row->>'changing_stations' AS changing_stations,
       (row->>'latitude')::double precision AS lat,
       (row->>'longitude')::double precision AS lon
FROM raw.restrooms
WHERE row->>'latitude' IS NOT NULL AND row->>'longitude' IS NOT NULL;
DROP TABLE IF EXISTS core.osm_toilets;
