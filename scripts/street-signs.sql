-- Corner street-name signs from DCP LION (EPSG:2263, US feet). Run by
-- scripts/build-sign-tiles.ts with LION_GDB set; the COPY target is substituted there.
-- An intersection is a LION node shared by segments of >= 2 different streets; each
-- street's bearing runs from the node to the segment's other end node.
LOAD spatial;
SET VARIABLE lion = getenv('LION_GDB');
CREATE TEMP TABLE node AS
SELECT NODEID AS id, Shape AS p FROM ST_Read(getvariable('lion'), layer = 'node');
CREATE TEMP TABLE seg AS
SELECT DISTINCT trim(Street) AS street, NodeIDFrom::INT AS nf, NodeIDTo::INT AS nt
FROM ST_Read(getvariable('lion'), layer = 'lion')
WHERE FeatureTyp IN ('0', '6', 'A', 'W', 'C') AND trim(RW_TYPE) = '1'
  AND coalesce(NonPed, '') NOT IN ('V', 'D') AND trim(coalesce(Street, '')) <> ''
  AND Street NOT ILIKE '%DRIVEWAY%' AND Street NOT ILIKE '%BOUNDARY%';
CREATE TEMP TABLE arms AS
SELECT e.node, e.street, count(*) AS n,
       (degrees(ST_Azimuth(any_value(a.p), any_value(b.p))) + 360) % 180 AS brg
FROM (SELECT street, nf AS node, nt AS other FROM seg UNION ALL SELECT street, nt, nf FROM seg) e
JOIN node a ON a.id = e.node JOIN node b ON b.id = e.other
GROUP BY e.node, e.street;
-- Blade A is the node's busiest street, blade B the cross street closest to perpendicular.
CREATE TEMP TABLE pairs AS
SELECT a.node, a.street AS a, a.brg AS ba, b.street AS b, b.brg AS bb,
       row_number() OVER (PARTITION BY a.node ORDER BY a.n DESC, a.street,
         abs(90 - abs(b.brg - a.brg))) AS r
FROM arms a JOIN arms b ON a.node = b.node AND a.street <> b.street;
-- Sign-style abbreviations, as on DOT blades.
CREATE MACRO abbr(s) AS regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
  s, '\bSTREET\b', 'ST', 'g'), '\bAVENUE\b', 'AV', 'g'), '\bBOULEVARD\b', 'BLVD', 'g'),
  '\bPLACE\b', 'PL', 'g'), '\bROAD\b', 'RD', 'g'), '^(E|W|N|S)(AST|EST|ORTH|OUTH) ', '\1 ', 'g');
COPY (
  SELECT abbr(a) AS a, abbr(b) AS b, round(ba, 1) AS ba, round(bb, 1) AS bb,
         ST_Transform(n.p, 'EPSG:2263', 'EPSG:4326', always_xy := true) AS geom
  FROM pairs JOIN node n ON n.id = pairs.node
  WHERE r = 1 AND abs(90 - abs(bb - ba)) < 60
) TO 'OUT_PLACEHOLDER' WITH (FORMAT GDAL, DRIVER 'GeoJSONSeq');
