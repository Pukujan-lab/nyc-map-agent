-- migrate:up
-- Adds community district to the block -> area lookup so the API can roll up to
-- block, NTA 2020, community district and borough. Only objects created by the
-- previous migration are rebuilt; public.* tables are untouched.
DROP MATERIALIZED VIEW IF EXISTS marts.nta_month;
DROP VIEW IF EXISTS core.areas;
DROP MATERIALIZED VIEW IF EXISTS core.block_areas;

-- 311's community_board looks like "01 BROOKLYN"; boro_cd is borough digit * 100 + district.
CREATE OR REPLACE FUNCTION core.boro_cd(community_board text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE split_part(upper(community_board), ' ', 2)
           WHEN 'MANHATTAN' THEN 100 WHEN 'BRONX' THEN 200 WHEN 'BROOKLYN' THEN 300
           WHEN 'QUEENS' THEN 400 WHEN 'STATEN' THEN 500 END
         + nullif(regexp_replace(split_part(community_board, ' ', 1), '\D', '', 'g'), '')::int
$$;

CREATE MATERIALIZED VIEW core.block_areas AS
WITH nta AS (
  SELECT DISTINCT ON (r, c) r, c, nta2020, borough
  FROM (SELECT r, c, nta2020, upper(borough) AS borough, count(*) AS n
        FROM core.events WHERE nta2020 IS NOT NULL GROUP BY 1, 2, 3, 4) t
  ORDER BY r, c, n DESC
), cd AS (
  SELECT DISTINCT ON (r, c) r, c, boro_cd
  FROM (SELECT floor(latitude / 0.003)::int AS r, floor(longitude / 0.003)::int AS c,
               core.boro_cd(community_board) AS boro_cd, count(*) AS n
        FROM public.nyc_311_noise
        WHERE latitude IS NOT NULL AND core.boro_cd(community_board) IS NOT NULL
        GROUP BY 1, 2, 3) t
  ORDER BY r, c, n DESC
)
SELECT nta.r, nta.c, nta.nta2020, nta.borough, cd.boro_cd
FROM nta LEFT JOIN cd USING (r, c)
WITH NO DATA;
CREATE UNIQUE INDEX block_areas_key ON core.block_areas (r, c);
CREATE INDEX block_areas_nta ON core.block_areas (nta2020);
CREATE INDEX block_areas_cd ON core.block_areas (boro_cd);

CREATE VIEW core.areas AS
SELECT 'nta'::text AS level, nta2020 AS area, borough, count(*) AS blocks FROM core.block_areas GROUP BY 2, 3
UNION ALL
SELECT 'cd', boro_cd::text, borough, count(*) FROM core.block_areas WHERE boro_cd IS NOT NULL GROUP BY 2, 3
UNION ALL
SELECT 'borough', borough, borough, count(*) FROM core.block_areas GROUP BY 2, 3;

CREATE MATERIALIZED VIEW marts.nta_month AS
SELECT b.source_id, b.month, a.nta2020, a.borough, b.category, b.severity, sum(b.n) AS n
FROM marts.block_month b JOIN core.block_areas a USING (r, c)
GROUP BY 1, 2, 3, 4, 5, 6
WITH NO DATA;
CREATE UNIQUE INDEX nta_month_key
  ON marts.nta_month (source_id, coalesce(month, DATE '0001-01-01'), nta2020, borough, category, severity);

-- migrate:down
DROP MATERIALIZED VIEW IF EXISTS marts.nta_month;
DROP VIEW IF EXISTS core.areas;
DROP MATERIALIZED VIEW IF EXISTS core.block_areas;
DROP FUNCTION IF EXISTS core.boro_cd(text);
