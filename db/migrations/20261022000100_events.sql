-- migrate:up
-- Events layer: NYC permitted events (NYC Open Data tvpp-9vvx) and NYC Parks public
-- events (w3wp-dpdi), normalised by server/features/events/ingest.ts and upserted
-- nightly. location is a GeoJSON Point or LineString; lon/lat is its first point,
-- used for the bbox filter in /api/events.
CREATE TABLE IF NOT EXISTS core.events (
  id           text PRIMARY KEY,
  title        text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('fair', 'market', 'popup', 'show', 'parks', 'closure', 'other')),
  start_at     timestamptz NOT NULL,
  end_at       timestamptz NOT NULL,
  location     jsonb NOT NULL,
  lon          double precision GENERATED ALWAYS AS ((CASE WHEN location->>'type' = 'Point' THEN location->'coordinates' ELSE location->'coordinates'->0 END ->> 0)::double precision) STORED,
  lat          double precision GENERATED ALWAYS AS ((CASE WHEN location->>'type' = 'Point' THEN location->'coordinates' ELSE location->'coordinates'->0 END ->> 1)::double precision) STORED,
  address      text,
  source       text NOT NULL,
  url          text,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_time_idx ON core.events (start_at, end_at);

-- migrate:down
DROP TABLE IF EXISTS core.events;
