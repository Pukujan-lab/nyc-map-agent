/**
 * Storefront signs for the city tiles: named OSM shops and amenities from the
 * Geofabrik New York extract (ODbL, © OpenStreetMap contributors), filtered
 * with osmium, then snapped to the nearest footprint wall with DuckDB spatial.
 *
 * Placement: each shop goes to the footprint it is in or fronts (<= 30 m) and to
 * that footprint's edge nearest its point, so corner buildings split by street.
 * Shops on one edge and floor share it in equal slots (projected order, <= 6 m,
 * 0.4 m gap, never overlapping). A floor comes from OSM level / addr:floor.
 * A footprint with > 6 shops, or a mall / named retail building, gets one main
 * sign (mall name or "N shops") on the edge most shops face, carrying the shop
 * directory. Entrance nodes are not used yet: the main sign sits at mid-edge.
 *
 * Each sign is one point on the wall with:
 *   name, cat (food | shop | health | money | service | mall), kind (raw OSM value),
 *   brg  outward wall normal, degrees clockwise from north (the way the sign faces),
 *   sw   sign width in metres, fl floor (0 = ground), w wall edge length in metres
 *        (room for a later procedural storefront), main/dir for the directory sign.
 *
 * Needs osmium-tool and the duckdb CLI (spatial) on PATH. The extract is cached
 * at OSM_PBF (default /tmp/new-york-latest.osm.pbf) and downloaded if missing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const PBF_URL = "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf";
const AMENITIES = ["restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "pharmacy", "bank", "bureau_de_change", "clinic", "dentist", "post_office"];

export interface Bbox { west: number; south: number; east: number; north: number }

export function signCategory(shop: string | null, amenity: string | null): string {
  if (shop) return "shop";
  if (["restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream"].includes(amenity ?? "")) return "food";
  if (["pharmacy", "clinic", "dentist"].includes(amenity ?? "")) return "health";
  if (["bank", "bureau_de_change"].includes(amenity ?? "")) return "money";
  return "service";
}

/** Returns GeoJSON point features (tippecanoe layer "storefronts", z16 only). */
export function storefrontFeatures(bbox: Bbox, footprintsNdjson: string, tag: string): object[] {
  const pbf = process.env.OSM_PBF ?? "/tmp/new-york-latest.osm.pbf";
  if (!existsSync(pbf)) execFileSync("curl", ["-sSL", "-o", pbf, PBF_URL], { stdio: "inherit" });
  const cut = `/tmp/${tag}-osm.pbf`, shops = `/tmp/${tag}-shops.pbf`, seq = `/tmp/${tag}-shops.geojsonl`, out = `/tmp/${tag}-signs.csv`;
  const b = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  execFileSync("osmium", ["extract", "-b", b, pbf, "-o", cut, "--overwrite"], { stdio: "inherit" });
  execFileSync("osmium", ["tags-filter", cut, "nwr/shop", `nwr/amenity=${AMENITIES.join(",")}`, "wr/building=retail", "wr/landuse=retail", "-o", shops, "--overwrite"], { stdio: "inherit" });
  execFileSync("osmium", ["export", shops, "-f", "geojsonseq", "-x", "print_record_separator=false",
    "--geometry-types=point,polygon", "-o", seq, "--overwrite"], { stdio: "inherit" });
  const sql = `INSTALL spatial; LOAD spatial;
CREATE TABLE f AS SELECT i, ST_GeomFromGeoJSON(g) AS geom FROM read_json('${footprintsNdjson}', format='newline_delimited', columns={i:'INTEGER', g:'VARCHAR'});
CREATE TABLE raw AS SELECT row_number() OVER () AS k, properties->>'name' AS name, properties->>'shop' AS shop,
  properties->>'amenity' AS amenity, properties->>'building' AS building, properties->>'landuse' AS landuse,
  try_cast(coalesce(properties->>'level', properties->>'addr:floor') AS DOUBLE) AS lvl,
  ST_Centroid(ST_GeomFromGeoJSON(geometry::VARCHAR)) AS p
  FROM read_json('${seq}', format='newline_delimited', columns={properties:'JSON', geometry:'JSON'})
  WHERE properties->>'name' IS NOT NULL;
-- malls / named retail buildings: they name the footprint they sit on
CREATE TABLE malls AS SELECT * FROM raw WHERE shop = 'mall' OR building = 'retail' OR landuse = 'retail';
CREATE TABLE s AS SELECT * FROM raw WHERE (shop IS NOT NULL AND shop <> 'mall') OR (amenity IS NOT NULL AND shop IS NULL AND building IS NULL AND landuse IS NULL);
CREATE TABLE m AS SELECT * EXCLUDE (rk) FROM (
  SELECT s.*, f.i, f.geom, row_number() OVER (PARTITION BY s.k ORDER BY ST_Distance(f.geom, s.p)) AS rk
  FROM s JOIN f ON ST_DWithin(f.geom, s.p, 0.0003)) WHERE rk = 1;
CREATE TABLE fm AS SELECT i, any_value(malls.name) AS mall FROM malls JOIN f ON ST_Contains(f.geom, malls.p) GROUP BY i;
-- every footprint edge with its outward normal bearing and length
CREATE TABLE edges AS SELECT i, n, seg, len, CASE WHEN ST_Contains(geom, ST_Point(mx + sin(radians(nb)) / kx, my + cos(radians(nb)) / 111320.0)) THEN (nb + 180) % 360 ELSE nb END AS brg
  FROM (SELECT i, n, geom, seg, ST_X(ST_Centroid(seg)) AS mx, ST_Y(ST_Centroid(seg)) AS my,
      111320.0 * cos(radians(ST_Y(ST_Centroid(seg)))) AS kx,
      ST_Distance(ST_StartPoint(seg), ST_EndPoint(seg)) * 111320.0 * cos(radians(ST_Y(ST_Centroid(seg))) * 0.5) AS len,
      (degrees(atan2((ST_X(ST_EndPoint(seg)) - ST_X(ST_StartPoint(seg))) * cos(radians(ST_Y(ST_StartPoint(seg)))), ST_Y(ST_EndPoint(seg)) - ST_Y(ST_StartPoint(seg)))) + 90 + 360) % 360 AS nb
    FROM (SELECT f.i, f.geom, n, ST_MakeLine(ST_PointN(r, n::INTEGER), ST_PointN(r, n::INTEGER + 1)) AS seg
      FROM (SELECT f.*, ST_ExteriorRing((ST_Dump(geom))[1].geom) AS r FROM f WHERE i IN (SELECT i FROM m)) f
      CROSS JOIN LATERAL range(1, ST_NPoints(r)) t(n)));
-- each shop to the facade edge nearest its point (corners split naturally), with its position t along it
CREATE TABLE a AS SELECT * EXCLUDE (rk) FROM (
  SELECT m.k, m.name, m.shop, m.amenity, coalesce(m.lvl, 0) AS lvl, m.i, e.n, e.seg, e.len, e.brg,
    ST_LineLocatePoint(e.seg, m.p) AS t, row_number() OVER (PARTITION BY m.k ORDER BY ST_Distance(e.seg, m.p)) AS rk
  FROM m JOIN edges e USING (i)) WHERE rk = 1;
CREATE TABLE fc AS SELECT i, count(*) AS shops FROM a GROUP BY i;
-- (1) ordinary buildings: equal slots along each edge and floor, in projected order
CREATE TABLE slots AS SELECT a.*, row_number() OVER w AS slot, count(*) OVER (PARTITION BY i, n, lvl) AS nslot
  FROM a JOIN fc USING (i) LEFT JOIN fm USING (i) WHERE fc.shops <= 6 AND fm.mall IS NULL
  WINDOW w AS (PARTITION BY i, n, lvl ORDER BY t, k);
COPY (
  SELECT name, coalesce(shop, '') AS shop, coalesce(amenity, '') AS amenity, ST_X(q) AS lon, ST_Y(q) AS lat, round(brg) AS brg,
    round(least(6.0, len / nslot - 0.4), 1) AS sw, lvl, round(len, 1) AS w, 0 AS main, '' AS dir
  FROM (SELECT *, ST_LineInterpolatePoint(seg, (slot - 0.5) / nslot) AS q FROM slots) WHERE len / nslot - 0.4 >= 0.8
  UNION ALL
  -- (3) malls and >6-shop buildings: one main sign on the edge most shops face, plus the directory
  SELECT coalesce(any_value(fm.mall), count(*) || ' shops'), 'mall', '', ST_X(ST_Centroid(any_value(e.seg))), ST_Y(ST_Centroid(any_value(e.seg))),
    round(any_value(e.brg)), round(least(8.0, any_value(e.len) - 0.4), 1), 0, round(any_value(e.len), 1), 1,
    string_agg(replace(a.name, '|', ' '), '|' ORDER BY a.name)
  FROM a JOIN fc USING (i) LEFT JOIN fm USING (i)
  JOIN (SELECT i, n, row_number() OVER (PARTITION BY i ORDER BY count(*) DESC, n) AS r FROM a GROUP BY i, n) top ON top.i = a.i AND top.r = 1
  JOIN edges e ON e.i = a.i AND e.n = top.n
  WHERE fc.shops > 6 OR fm.mall IS NOT NULL GROUP BY a.i
) TO '${out}' (HEADER false, DELIMITER '\\t', QUOTE '');`;
  execFileSync("duckdb", ["-c", sql], { stdio: ["ignore", "ignore", "inherit"], maxBuffer: 1 << 26 });
  const features: object[] = [];
  for (const line of readFileSync(out, "utf8").split("\n")) {
    const [name, shop, amenity, lon, lat, brg, sw, lvl, w, main, dir] = line.split("\t");
    if (!name || !lon) continue;
    features.push({
      type: "Feature",
      tippecanoe: { layer: "storefronts", minzoom: 16 },
      properties: {
        name: name.replace(/\s+/g, " ").trim().slice(0, 40),
        cat: main === "1" ? "mall" : signCategory(shop || null, amenity || null),
        kind: shop || amenity, brg: Number(brg), sw: Number(sw), fl: Number(lvl) || 0, w: Number(w),
        ...(main === "1" ? { main: 1, dir: dir.slice(0, 4000) } : {}),
      },
      geometry: { type: "Point", coordinates: [+Number(lon).toFixed(7), +Number(lat).toFixed(7)] },
    });
  }
  return features;
}
