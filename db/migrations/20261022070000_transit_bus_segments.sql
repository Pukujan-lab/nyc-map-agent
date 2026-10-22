-- migrate:up
-- Learned bus stop-to-stop travel and stop dwell times (scripts/transit-observe.ts,
-- server/features/transit/busObserve.ts). Bus positions are far more numerous
-- than subway arrivals, so instead of a raw log this keeps a bounded reservoir:
-- one row per route/direction/segment/hour-of-week holding at most the 15 most
-- recent per-run medians. Rows not refreshed for 60 days are trimmed by the observer.
CREATE TABLE IF NOT EXISTS raw.transit_bus_segment_samples (
  route text NOT NULL,
  dir smallint NOT NULL, -- -1 when unknown
  from_stop text NOT NULL,
  to_stop text NOT NULL, -- same as from_stop for dwell rows
  kind text NOT NULL CHECK (kind IN ('travel', 'dwell')),
  dow smallint NOT NULL CHECK (dow BETWEEN 1 AND 7),
  hour smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
  samples real[] NOT NULL CHECK (cardinality(samples) BETWEEN 1 AND 15),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (route, dir, from_stop, to_stop, kind, dow, hour)
);
CREATE INDEX IF NOT EXISTS transit_bus_segment_samples_updated ON raw.transit_bus_segment_samples (updated_at);

-- migrate:down
DROP TABLE IF EXISTS raw.transit_bus_segment_samples;
