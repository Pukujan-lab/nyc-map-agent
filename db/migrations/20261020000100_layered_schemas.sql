-- migrate:up
-- Layered schemas. Existing public.nyc_* tables stay where they are; raw.* views
-- point at them so nothing is copied or dropped.
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS marts;

-- raw: as-landed data ---------------------------------------------------------
CREATE OR REPLACE VIEW raw.noise_311 AS SELECT * FROM public.nyc_311_noise;
CREATE OR REPLACE VIEW raw.crashes AS SELECT * FROM public.nyc_crashes;
CREATE OR REPLACE VIEW raw.rollup_311_hourly AS SELECT * FROM public.nyc_311_rollup_hourly;

-- Registry sources that have no event table: Socrata rolls them up to the
-- ~300 m block grid (floor(lat/0.003), floor(lon/0.003)) per month and category.
-- month IS NULL marks an inventory snapshot (trees, ramps, PLUTO, ...).
CREATE TABLE IF NOT EXISTS raw.source_cells (
  source_id  text   NOT NULL,
  month      date,
  r          integer NOT NULL,
  c          integer NOT NULL,
  category   text   NOT NULL DEFAULT '',
  n          double precision NOT NULL,
  loaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS source_cells_key
  ON raw.source_cells (source_id, coalesce(month, DATE '0001-01-01'), r, c, category);
CREATE INDEX IF NOT EXISTS source_cells_month ON raw.source_cells (source_id, month);

-- core: conformed entities ----------------------------------------------------
-- core.sources mirrors src/lib/datasets/registry.ts; scripts/ingest.ts upserts it.
CREATE TABLE IF NOT EXISTS core.sources (
  id           text PRIMARY KEY,
  label        text NOT NULL,
  short_label  text NOT NULL,
  category     text NOT NULL,
  dataset_id   text NOT NULL,
  kind         text NOT NULL,
  unit         text NOT NULL,
  polarity     text NOT NULL CHECK (polarity IN ('worse', 'better')),
  windowed     boolean NOT NULL,
  description  text NOT NULL,
  guide        jsonb NOT NULL DEFAULT '{}'::jsonb,
  filters      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.ingest_runs (
  id          bigserial PRIMARY KEY,
  source_id   text NOT NULL,
  started_at  timestamptz NOT NULL,
  finished_at timestamptz,
  rows        bigint,
  status      text NOT NULL,
  detail      text
);

-- One row per event, block grid attached. Noise and crashes are the event-grain
-- sources today; other sources arrive pre-aggregated in raw.source_cells.
CREATE OR REPLACE VIEW core.events AS
SELECT 'noise'::text AS source_id,
       unique_key::text AS event_id,
       created_date AS ts,
       complaint_type AS category,
       descriptor AS subcategory,
       NULL::text AS severity,
       upper(street_name) AS street,
       borough, nta2020, latitude AS lat, longitude AS lon,
       floor(latitude / 0.003)::int AS r,
       floor(longitude / 0.003)::int AS c
FROM public.nyc_311_noise
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
UNION ALL
SELECT 'crashes', collision_id::text, crash_date, 'Crash',
       contributing_factor_vehicle_1,
       CASE WHEN number_of_persons_killed > 0 THEN 'fatal'
            WHEN number_of_persons_injured > 0 THEN 'injury'
            ELSE 'no injury' END,
       upper(on_street_name), borough, nta2020, latitude, longitude,
       floor(latitude / 0.003)::int, floor(longitude / 0.003)::int
FROM public.nyc_crashes
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE OR REPLACE VIEW core.assets AS
SELECT source_id, r, c, category, n FROM raw.source_cells WHERE month IS NULL;

-- Block -> NTA/borough: the most common nta2020 among events in the block.
CREATE MATERIALIZED VIEW IF NOT EXISTS core.block_areas AS
SELECT DISTINCT ON (r, c) r, c, nta2020, borough
FROM (
  SELECT r, c, nta2020, upper(borough) AS borough, count(*) AS n
  FROM core.events WHERE nta2020 IS NOT NULL
  GROUP BY 1, 2, 3, 4
) t
ORDER BY r, c, n DESC
WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS block_areas_key ON core.block_areas (r, c);
CREATE INDEX IF NOT EXISTS block_areas_nta ON core.block_areas (nta2020);

CREATE OR REPLACE VIEW core.areas AS
SELECT nta2020, borough, count(*) AS blocks FROM core.block_areas GROUP BY 1, 2;

-- marts: what the API reads ---------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS marts.block_month AS
SELECT source_id, date_trunc('month', ts)::date AS month, r, c,
       coalesce(category, '') AS category, coalesce(severity, '') AS severity,
       count(*)::double precision AS n
FROM core.events
WHERE ts >= now() - interval '13 months'
GROUP BY 1, 2, 3, 4, 5, 6
UNION ALL
SELECT source_id, month, r, c, category, '', n FROM raw.source_cells
WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS block_month_key
  ON marts.block_month (source_id, coalesce(month, DATE '0001-01-01'), r, c, category, severity);
CREATE INDEX IF NOT EXISTS block_month_src_month ON marts.block_month (source_id, month);

CREATE MATERIALIZED VIEW IF NOT EXISTS marts.nta_month AS
SELECT b.source_id, b.month, a.nta2020, a.borough, b.category, b.severity, sum(b.n) AS n
FROM marts.block_month b JOIN core.block_areas a USING (r, c)
GROUP BY 1, 2, 3, 4, 5, 6
WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS nta_month_key
  ON marts.nta_month (source_id, coalesce(month, DATE '0001-01-01'), nta2020, borough, category, severity);

-- Per-block totals and citywide percentile for each window.
CREATE MATERIALIZED VIEW IF NOT EXISTS marts.block_window AS
WITH w AS (
  SELECT '90d'::text AS win, (now() - interval '90 days')::date AS since
  UNION ALL SELECT '12mo', (now() - interval '12 months')::date
), t AS (
  SELECT b.source_id, w.win, b.r, b.c, sum(b.n) AS n
  FROM marts.block_month b CROSS JOIN w
  WHERE b.month IS NULL OR b.month >= date_trunc('month', w.since)
  GROUP BY 1, 2, 3, 4
)
SELECT t.*, round((percent_rank() OVER (PARTITION BY source_id, win ORDER BY n) * 100)::numeric, 1) AS pct
FROM t
WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS block_window_key ON marts.block_window (source_id, win, r, c);
CREATE INDEX IF NOT EXISTS block_window_rc ON marts.block_window (r, c);

-- Per-street stats for the walk bubble: counts plus a four-step level by citywide quartile.
CREATE MATERIALIZED VIEW IF NOT EXISTS marts.street_stats AS
WITH s AS (
  SELECT street, upper(borough) AS borough,
         count(*) FILTER (WHERE source_id = 'noise' AND ts >= now() - interval '12 months') AS noise_12mo,
         count(*) FILTER (WHERE source_id = 'noise' AND ts >= now() - interval '90 days') AS noise_90d,
         count(*) FILTER (WHERE source_id = 'crashes' AND ts >= now() - interval '12 months') AS crashes_12mo,
         count(*) FILTER (WHERE source_id = 'crashes' AND severity = 'injury' AND ts >= now() - interval '12 months') AS injury_crashes_12mo,
         count(*) FILTER (WHERE source_id = 'crashes' AND severity = 'fatal' AND ts >= now() - interval '12 months') AS fatal_crashes_12mo
  FROM core.events
  WHERE street IS NOT NULL AND street <> ''
  GROUP BY 1, 2
)
SELECT s.*,
  (ARRAY['green','yellow','orange','red'])[ntile(4) OVER (ORDER BY noise_12mo)] AS noise_level,
  (ARRAY['green','yellow','orange','red'])[ntile(4) OVER (ORDER BY crashes_12mo)] AS crash_level
FROM s
WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS street_stats_key ON marts.street_stats (street, borough);

-- migrate:down
DROP MATERIALIZED VIEW IF EXISTS marts.street_stats;
DROP MATERIALIZED VIEW IF EXISTS marts.block_window;
DROP MATERIALIZED VIEW IF EXISTS marts.nta_month;
DROP MATERIALIZED VIEW IF EXISTS marts.block_month;
DROP VIEW IF EXISTS core.areas;
DROP MATERIALIZED VIEW IF EXISTS core.block_areas;
DROP VIEW IF EXISTS core.assets;
DROP VIEW IF EXISTS core.events;
DROP TABLE IF EXISTS core.ingest_runs;
DROP TABLE IF EXISTS core.sources;
DROP TABLE IF EXISTS raw.source_cells;
DROP VIEW IF EXISTS raw.rollup_311_hourly;
DROP VIEW IF EXISTS raw.crashes;
DROP VIEW IF EXISTS raw.noise_311;
