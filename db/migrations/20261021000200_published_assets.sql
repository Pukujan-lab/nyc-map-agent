-- migrate:up
-- Large static assets published through Octo files (R2 public bucket). A file
-- bigger than one upload request is split into parts; the app's
-- /api/city-tiles stitches Range requests across them.
CREATE TABLE IF NOT EXISTS core.published_assets (
  name text PRIMARY KEY,         -- e.g. 'nyc-city.pmtiles'
  total_bytes bigint NOT NULL,
  etag text NOT NULL,            -- sha256 of the whole file
  parts jsonb NOT NULL,          -- [{ fileId, url, bytes }] in order
  published_at timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE IF EXISTS core.published_assets;
