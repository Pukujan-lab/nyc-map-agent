-- Restrooms ingest SQL lives with its module.
-- Schema: db/migrations/20261021000300_restrooms.sql (dbmate migrations stay in db/migrations).
SELECT name, status, hours, accessibility, operator, location_type, lat, lon FROM core.restrooms ORDER BY name;
