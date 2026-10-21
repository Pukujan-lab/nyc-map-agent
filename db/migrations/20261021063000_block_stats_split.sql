-- migrate:up
-- Street points are now split between the facing blocks (scripts/block-join.ts),
-- so per-block totals are fractional; area_m2 backs the per-hectare shading.
ALTER TABLE marts.block_stats
  ALTER COLUMN n TYPE numeric(10, 1),
  ALTER COLUMN night TYPE numeric(10, 1),
  ALTER COLUMN injured TYPE numeric(10, 1),
  ALTER COLUMN killed TYPE numeric(10, 1),
  ALTER COLUMN cyclists TYPE numeric(10, 1),
  ADD COLUMN IF NOT EXISTS area_m2 integer;

-- migrate:down
ALTER TABLE marts.block_stats DROP COLUMN IF EXISTS area_m2;
