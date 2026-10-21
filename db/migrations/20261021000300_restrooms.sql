-- migrate:up
-- Public restrooms (NYC Open Data i7jb-7jku). raw keeps each row as landed;
-- core is the typed, located view the app reads through /api/restrooms.
CREATE TABLE IF NOT EXISTS raw.restrooms (
  facility_name text PRIMARY KEY,
  row           jsonb NOT NULL,
  loaded_at     timestamptz NOT NULL DEFAULT now()
);

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
       (row->>'longitude')::double precision AS lon
FROM raw.restrooms
WHERE row->>'latitude' IS NOT NULL AND row->>'longitude' IS NOT NULL;

-- migrate:down
DROP VIEW IF EXISTS core.restrooms;
DROP TABLE IF EXISTS raw.restrooms;
