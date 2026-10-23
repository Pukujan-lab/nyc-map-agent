-- migrate:up
-- Registry sources that the ingest joins to real tax blocks (point-in-block, as
-- for noise / crashes): counts keyed by block_id = boro * 100000 + block, the
-- feature id in nyc-blocks.pmtiles. Only the sources listed in
-- src/lib/datasets/blockKeyed.ts are written here; /api/blocks serves them from
-- these tables at level=block and keeps the ~300 m grid for the other levels.
CREATE TABLE IF NOT EXISTS core.tax_blocks (
  block_id   integer PRIMARY KEY,
  boro       smallint NOT NULL,
  block      integer NOT NULL,
  label      text NOT NULL,
  nta2020    text,
  west       double precision NOT NULL,
  south      double precision NOT NULL,
  east       double precision NOT NULL,
  north      double precision NOT NULL,
  area_m2    integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tax_blocks_nta ON core.tax_blocks (nta2020);

CREATE TABLE IF NOT EXISTS raw.source_block_cells (
  source_id text NOT NULL,
  month     date,                 -- NULL marks an inventory snapshot
  block_id  integer NOT NULL,
  n         double precision NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS source_block_cells_key
  ON raw.source_block_cells (source_id, coalesce(month, DATE '0001-01-01'), block_id);
CREATE INDEX IF NOT EXISTS source_block_cells_month ON raw.source_block_cells (source_id, month);

-- migrate:down
DROP TABLE IF EXISTS raw.source_block_cells;
DROP TABLE IF EXISTS core.tax_blocks;
