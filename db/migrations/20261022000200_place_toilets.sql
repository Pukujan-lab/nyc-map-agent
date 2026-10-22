-- migrate:up
-- Restaurants, cafés, bars and shops that have a toilet (OpenStreetMap via
-- Overpass, ODbL), refreshed nightly by server/features/place-toilets/ingest.ts.
-- access: 'anyone' (toilets:access=yes|permissive|public) or 'customers'
-- (toilets:access=customers, or untagged: the safe reading at a business).
-- The public restrooms in core.restrooms stay the primary layer.
CREATE TABLE core.place_toilets (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  kind            text NOT NULL,
  access          text NOT NULL CHECK (access IN ('anyone', 'customers')),
  access_tagged   boolean NOT NULL,
  wheelchair      boolean,
  changing_table  boolean,
  fee             boolean,
  lon             double precision NOT NULL,
  lat             double precision NOT NULL,
  source          text NOT NULL,
  url             text NOT NULL,
  refreshed_at    timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE IF EXISTS core.place_toilets;
