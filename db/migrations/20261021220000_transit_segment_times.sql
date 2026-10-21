-- migrate:up
-- Observed subway segment travel and station dwell times from GTFS-rt
-- (scripts/transit-observe.ts). Plain Postgres: a raw table capped at
-- 60 days by the observer, plus an hourly/weekday rollup refreshed with the marts.
CREATE TABLE IF NOT EXISTS raw.transit_segment_obs (
  observed_at timestamptz NOT NULL,
  system text NOT NULL,
  route text NOT NULL,
  dir smallint,
  from_stop text NOT NULL,
  to_stop text NOT NULL, -- same as from_stop for dwell rows
  kind text NOT NULL CHECK (kind IN ('travel', 'dwell')),
  seconds real NOT NULL CHECK (seconds >= 0 AND seconds < 3600),
  trip_id text NOT NULL,
  PRIMARY KEY (trip_id, from_stop, to_stop, kind, observed_at)
);
CREATE INDEX IF NOT EXISTS transit_segment_obs_time ON raw.transit_segment_obs (observed_at);

CREATE MATERIALIZED VIEW IF NOT EXISTS marts.transit_segment_hourly AS
SELECT
  system, route, coalesce(dir, -1)::smallint AS dir, from_stop, to_stop, kind,
  extract(isodow FROM observed_at AT TIME ZONE 'America/New_York')::smallint AS dow,
  extract(hour FROM observed_at AT TIME ZONE 'America/New_York')::smallint AS hour,
  count(*)::int AS n,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds)::real AS median_s,
  percentile_cont(0.8) WITHIN GROUP (ORDER BY seconds)::real AS p80_s
FROM raw.transit_segment_obs
WHERE observed_at > now() - interval '60 days'
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8;
CREATE UNIQUE INDEX IF NOT EXISTS transit_segment_hourly_key
  ON marts.transit_segment_hourly (system, route, dir, from_stop, to_stop, kind, dow, hour);

-- migrate:down
DROP MATERIALIZED VIEW IF EXISTS marts.transit_segment_hourly;
DROP TABLE IF EXISTS raw.transit_segment_obs;
