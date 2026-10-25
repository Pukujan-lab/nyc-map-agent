-- migrate:up
-- Every version of each published asset, not just the current and one
-- previous. core.published_assets stays the current pointer (name -> etag) that
-- /api/city-tiles reads; this table keeps each version's parts and when it was
-- current, so a deploy time maps to the exact tile set it served (#203).
CREATE TABLE IF NOT EXISTS core.published_asset_versions (
  name text NOT NULL,
  etag text NOT NULL,            -- first 32 hex chars of the file's sha256
  total_bytes bigint NOT NULL,
  parts jsonb NOT NULL,          -- [{ fileId, url, bytes }] in order
  published_at timestamptz,      -- null only for versions published before this table
  retired_at timestamptz,        -- when another version became current
  pruned_at timestamptz,         -- when its Octo files were deleted
  PRIMARY KEY (name, etag)
);

-- Backfill: each current version, then the one previous version kept for rollback.
INSERT INTO core.published_asset_versions (name, etag, total_bytes, parts, published_at)
SELECT name, etag, total_bytes, parts, published_at FROM core.published_assets
ON CONFLICT (name, etag) DO NOTHING;
INSERT INTO core.published_asset_versions (name, etag, total_bytes, parts, retired_at)
SELECT name, previous_etag, previous_total_bytes, previous_parts, published_at FROM core.published_assets
WHERE previous_etag IS NOT NULL AND previous_parts IS NOT NULL AND previous_total_bytes IS NOT NULL
ON CONFLICT (name, etag) DO NOTHING;

-- The pointer can only name a version that is in the history.
ALTER TABLE core.published_assets
  ADD CONSTRAINT published_assets_version_fk FOREIGN KEY (name, etag)
  REFERENCES core.published_asset_versions (name, etag);

-- migrate:down
ALTER TABLE core.published_assets DROP CONSTRAINT IF EXISTS published_assets_version_fk;
DROP TABLE IF EXISTS core.published_asset_versions;
