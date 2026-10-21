-- migrate:up
-- Boundary geometry lives next to core.areas (a view of block counts per area):
-- one simplified GeoJSON feature per NTA 2020 / community district, loaded by
-- scripts/load-areas.ts. Octo has no PostGIS, so geometry is plain jsonb.
CREATE TABLE IF NOT EXISTS core.area_shapes (
  level text NOT NULL,          -- 'nta' | 'cd'
  area text NOT NULL,           -- nta2020 code or boro_cd
  name text NOT NULL,
  borough text NOT NULL,
  geometry jsonb NOT NULL,      -- GeoJSON Polygon / MultiPolygon, simplified
  source_dataset text NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (level, area)
);

-- The browser's noise/crash rollups (NTA + ~300 m block detail, top types,
-- addresses, intersections), precomputed from core events by
-- scripts/build-aggregates.ts so the app never pages raw rows at startup.
CREATE TABLE IF NOT EXISTS marts.aggregates (
  dataset text NOT NULL,        -- 'noise' | 'crashes'
  window_id text NOT NULL,      -- '90d' | '12mo'
  result jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset, window_id)
);

-- migrate:down
DROP TABLE IF EXISTS marts.aggregates;
DROP TABLE IF EXISTS core.area_shapes;
