-- migrate:up
-- Registry sources (trees, HPD, all 311, ...) counted per real tax block, so
-- the Blocks scale shades the block tiles for them the way marts.block_stats
-- does for noise and crashes (#120).
--
-- raw.source_fine_cells: what scripts/ingest.ts already rolls up into
-- raw.source_cells, again at a ~22 m grid (fr = floor(lat / 0.0002),
-- fc = floor(lon / 0.0002)). month IS NULL marks an inventory snapshot.
CREATE TABLE IF NOT EXISTS raw.source_fine_cells (
  source_id  text NOT NULL,
  month      date,
  fr         integer NOT NULL,
  fc         integer NOT NULL,
  category   text NOT NULL DEFAULT '',
  n          double precision NOT NULL,
  loaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS source_fine_cells_key
  ON raw.source_fine_cells (source_id, coalesce(month, DATE '0001-01-01'), fr, fc, category);

-- marts.taxblock_month: those cells joined to the tax blocks by
-- scripts/build-aggregates.ts with the same point-in-block join as noise and
-- crashes. A street-bed cell is split between the blocks it faces, so n is fractional.
CREATE TABLE IF NOT EXISTS marts.taxblock_month (
  source_id text NOT NULL,
  month date,                     -- NULL for inventories, as in raw.source_cells
  block_id int NOT NULL,          -- boro * 100000 + block, the block tiles' feature id
  nta2020 text,
  lon double precision NOT NULL,  -- south-west corner of the block
  lat double precision NOT NULL,
  category text NOT NULL DEFAULT '',
  n double precision NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS taxblock_month_key
  ON marts.taxblock_month (source_id, coalesce(month, DATE '0001-01-01'), block_id, category);

-- migrate:down
DROP TABLE IF EXISTS marts.taxblock_month;
DROP TABLE IF EXISTS raw.source_fine_cells;
