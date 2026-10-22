-- migrate:up
-- Keep exactly one previous version of each published asset for rollback.
-- scripts/publish-city-tiles.ts moves the current parts here on every swap and
-- deletes the Octo files of whatever was here before.
ALTER TABLE core.published_assets
  ADD COLUMN IF NOT EXISTS previous_parts jsonb,
  ADD COLUMN IF NOT EXISTS previous_etag text,
  ADD COLUMN IF NOT EXISTS previous_total_bytes bigint;

-- migrate:down
ALTER TABLE core.published_assets
  DROP COLUMN IF EXISTS previous_parts,
  DROP COLUMN IF EXISTS previous_etag,
  DROP COLUMN IF EXISTS previous_total_bytes;
