-- migrate:up
-- Published-asset version history. Every upload is one row in
-- core.asset_versions keyed by (name, sha256); core.asset_current points at
-- the version each name serves. core.published_assets (a table until now,
-- with one previous_* slot from 20261021200000) becomes a read-only view with
-- the same columns, so readers (api/city-tiles.ts, scripts/build-aggregates.ts)
-- are unchanged. scripts/publish-city-tiles.ts writes the new tables.
CREATE TABLE IF NOT EXISTS core.asset_versions (
  name         text        NOT NULL,          -- e.g. 'nyc-city.pmtiles'
  sha256       text        NOT NULL,          -- hex sha256 of the whole file (32-hex etag prefix for rows backfilled from before this migration)
  total_bytes  bigint      NOT NULL,
  etag         text        NOT NULL,          -- first 32 hex of sha256 (what /api/city-tiles sends)
  parts        jsonb       NOT NULL,          -- [{ fileId, url, bytes }] in order
  published_at timestamptz NOT NULL DEFAULT now(),
  pruned_at    timestamptz,                   -- Octo files deleted; row kept as history
  PRIMARY KEY (name, sha256)
);

CREATE TABLE IF NOT EXISTS core.asset_current (
  name       text        PRIMARY KEY,
  sha256     text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (name, sha256) REFERENCES core.asset_versions (name, sha256)
);

-- Backfill from the old table: its previous version (if any), then current.
INSERT INTO core.asset_versions (name, sha256, total_bytes, etag, parts, published_at)
SELECT name, previous_etag, previous_total_bytes, previous_etag, previous_parts, published_at - interval '1 second'
FROM core.published_assets
WHERE previous_parts IS NOT NULL AND previous_etag IS NOT NULL AND previous_etag <> etag
ON CONFLICT DO NOTHING;
INSERT INTO core.asset_versions (name, sha256, total_bytes, etag, parts, published_at)
SELECT name, etag, total_bytes, etag, parts, published_at FROM core.published_assets
ON CONFLICT DO NOTHING;
INSERT INTO core.asset_current (name, sha256, updated_at)
SELECT name, etag, published_at FROM core.published_assets
ON CONFLICT (name) DO NOTHING;

DROP TABLE core.published_assets;

CREATE VIEW core.published_assets AS
SELECT v.name, v.total_bytes, v.etag, v.parts, v.published_at,
       p.parts AS previous_parts, p.etag AS previous_etag, p.total_bytes AS previous_total_bytes
FROM core.asset_current c
JOIN core.asset_versions v ON v.name = c.name AND v.sha256 = c.sha256
LEFT JOIN LATERAL (
  SELECT o.parts, o.etag, o.total_bytes FROM core.asset_versions o
  WHERE o.name = c.name AND o.sha256 <> c.sha256 AND o.pruned_at IS NULL
  ORDER BY o.published_at DESC LIMIT 1
) p ON true;

-- migrate:down
DROP VIEW IF EXISTS core.published_assets;
CREATE TABLE core.published_assets (
  name text PRIMARY KEY,
  total_bytes bigint NOT NULL,
  etag text NOT NULL,
  parts jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  previous_parts jsonb,
  previous_etag text,
  previous_total_bytes bigint
);
INSERT INTO core.published_assets
SELECT c.name, v.total_bytes, v.etag, v.parts, v.published_at, p.parts, p.etag, p.total_bytes
FROM core.asset_current c
JOIN core.asset_versions v ON v.name = c.name AND v.sha256 = c.sha256
LEFT JOIN LATERAL (
  SELECT o.parts, o.etag, o.total_bytes FROM core.asset_versions o
  WHERE o.name = c.name AND o.sha256 <> c.sha256 AND o.pruned_at IS NULL
  ORDER BY o.published_at DESC LIMIT 1
) p ON true;
DROP TABLE IF EXISTS core.asset_current;
DROP TABLE IF EXISTS core.asset_versions;
