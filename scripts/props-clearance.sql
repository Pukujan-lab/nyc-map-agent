-- Keeps street props off the carriageway. Run by scripts/build-city-tiles.ts with
-- LION_GDB, PROPS_IN (CSV id,kind,lon,lat) and PROPS_OUT set.
-- Each prop finds its nearest LION roadway segment (EPSG:2263, US feet). Anything
-- closer to the centreline than half the kerb-to-kerb width plus a per-kind clearance
-- is pushed straight out to the kerb + clearance; a prop sitting on the centreline
-- itself (no side to push to) is dropped. Benches also take the street's bearing.
LOAD spatial;
-- LION stores curves GDAL can't hand DuckDB, so each segment is taken as the straight
-- line between its end nodes (city segments are short and nearly all straight).
CREATE TEMP TABLE node AS SELECT NODEID AS id, Shape AS p FROM ST_Read(getenv('LION_GDB'), layer = 'node');
CREATE TEMP TABLE road AS
SELECT ST_MakeLine(a.p, b.p) AS g, ST_X(a.p) AS x1, ST_Y(a.p) AS y1, ST_X(b.p) AS x2, ST_Y(b.p) AS y2,
       coalesce(nullif(l.StreetWidth_Max, 0), nullif(l.StreetWidth_Min, 0), 30) / 2.0 AS half
FROM (SELECT NodeIDFrom::INT AS nf, NodeIDTo::INT AS nt, StreetWidth_Max, StreetWidth_Min
      FROM ST_Read(getenv('LION_GDB'), layer = 'lion')
      WHERE FeatureTyp IN ('0', '6', 'A', 'W', 'C') AND trim(RW_TYPE) = '1') l
JOIN node a ON a.id = l.nf JOIN node b ON b.id = l.nt
WHERE a.id <> b.id;
CREATE INDEX road_rtree ON road USING RTREE (g);
CREATE TEMP TABLE prop AS
SELECT id, kind,
  ST_Transform(ST_Point(lon, lat), 'EPSG:4326', 'EPSG:2263', always_xy := true) AS p,
  CASE kind WHEN 'tree' THEN 2.0 WHEN 'bench' THEN 4.0 ELSE 1.5 END AS clear
FROM read_csv(getenv('PROPS_IN'), header = true, columns = {'id': 'BIGINT', 'kind': 'VARCHAR', 'lon': 'DOUBLE', 'lat': 'DOUBLE'});
CREATE TEMP TABLE near AS
SELECT * FROM (
  SELECT prop.id, prop.clear, road.half, road.x1, road.y1, road.x2, road.y2,
         ST_Distance(prop.p, road.g) AS d,
         row_number() OVER (PARTITION BY prop.id ORDER BY ST_Distance(prop.p, road.g)) AS r
  FROM prop JOIN road ON ST_DWithin(prop.p, road.g, 80)
) WHERE r = 1;
-- Foot of the perpendicular from the prop to its segment (q), then out to the kerb.
CREATE TEMP TABLE moved AS
WITH f AS (
  SELECT prop.id, ST_X(prop.p) AS px, ST_Y(prop.p) AS py, near.*,
    near.x1 + (near.x2 - near.x1) * t AS qx, near.y1 + (near.y2 - near.y1) * t AS qy
  FROM prop LEFT JOIN near USING (id),
  LATERAL (SELECT greatest(0, least(1,
    ((ST_X(prop.p) - near.x1) * (near.x2 - near.x1) + (ST_Y(prop.p) - near.y1) * (near.y2 - near.y1))
    / nullif((near.x2 - near.x1) ^ 2 + (near.y2 - near.y1) ^ 2, 0))) AS t)
)
SELECT id,
  CASE
    WHEN d IS NULL OR d >= half + clear THEN ST_Point(px, py)
    WHEN d < 0.5 THEN NULL
    ELSE ST_Point(qx + (px - qx) / d * (half + clear), qy + (py - qy) / d * (half + clear))
  END AS p,
  CASE WHEN d IS NULL THEN 0 ELSE (degrees(atan2(x2 - x1, y2 - y1)) + 360) % 180 END AS brg,
  coalesce(d < half + clear, false) AS pushed
FROM f;
COPY (
  SELECT id,
    ST_X(ST_Transform(p, 'EPSG:2263', 'EPSG:4326', always_xy := true)) AS lon,
    ST_Y(ST_Transform(p, 'EPSG:2263', 'EPSG:4326', always_xy := true)) AS lat,
    round(brg, 1) AS brg, pushed
  FROM moved WHERE p IS NOT NULL
) TO 'PROPS_OUT_PLACEHOLDER' (HEADER, DELIMITER ',');
