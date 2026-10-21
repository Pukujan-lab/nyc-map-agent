-- migrate:up
-- Per real tax block (MapPLUTO dissolved by borough + block) noise / crash
-- totals per window, from the ingest's DuckDB point-in-block spatial join
-- (scripts/build-aggregates.ts). block_id = boro * 100000 + block, the feature
-- id in nyc-blocks.pmtiles. The same cells ride in marts.aggregates for the map.
CREATE TABLE IF NOT EXISTS marts.block_stats (
  dataset text NOT NULL,        -- 'noise' | 'crashes'
  window_id text NOT NULL,      -- '90d' | '12mo'
  block_id integer NOT NULL,
  boro smallint NOT NULL,       -- 1 Manhattan .. 5 Staten Island
  block integer NOT NULL,       -- DOF tax block number
  label text NOT NULL,          -- "Brooklyn block 585 · COURT STREET / UNION STREET"
  nta2020 text,
  n integer NOT NULL,
  night integer NOT NULL,
  injured integer NOT NULL DEFAULT 0,
  killed integer NOT NULL DEFAULT 0,
  cyclists integer NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset, window_id, block_id)
);
CREATE INDEX IF NOT EXISTS block_stats_nta ON marts.block_stats (nta2020);

-- migrate:down
DROP TABLE IF EXISTS marts.block_stats;
