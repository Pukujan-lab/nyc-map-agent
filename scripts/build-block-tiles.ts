/**
 * Real NYC blocks for the Blocks scale: DCP tax blocks, dissolved from MapPLUTO
 * lots by borough + block (DuckDB spatial), simplified with mapshaper and tiled
 * with tippecanoe.
 *
 *   MAPPLUTO_SHP=/path/MapPLUTO.shp pnpm build:block-tiles && pnpm publish:block-tiles
 *
 * Outputs (gitignored, under public/tiles/):
 *   nyc-blocks.pmtiles  layer "blocks": id (= boro * 100000 + block), boro, block, label
 *   nyc-blocks.geojson  the simplified polygons, used by the ingest's spatial join
 *
 * MapPLUTO (shoreline-clipped shapefile, EPSG:2263):
 * https://s-media.nyc.gov/agencies/dcp/assets/files/zip/data-tools/bytes/mappluto/nyc_mappluto_26v2_shp.zip
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { spatialDuck, sqlString } from "./duck";

const SHP = process.env.MAPPLUTO_SHP ?? "data/mappluto/MapPLUTO.shp";
const OUT_DIR = "public/tiles";
const RAW = `${OUT_DIR}/nyc-blocks.raw.geojson`;
const GEOJSON = `${OUT_DIR}/nyc-blocks.geojson`;
const PMTILES = `${OUT_DIR}/nyc-blocks.pmtiles`;
/** mapshaper Visvalingam retention; tax blocks are mostly 4-12 corners. */
/** Blocks bigger than this never receive snapped street points (a long Manhattan block is ~20k m²). */
const MAX_SNAP_AREA_M2 = Number(process.env.MAX_SNAP_AREA_M2 ?? 120_000);
const MAX_SNAP_PERIM_M = Number(process.env.MAX_SNAP_PERIM_M ?? 1_800);
const SIMPLIFY = process.env.BLOCK_SIMPLIFY ?? "12%";

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(RAW, { force: true });
  const con = await spatialDuck();
  const t0 = Date.now();
  // One row per tax block. The label names the block's two most common lot
  // street names (house numbers stripped): "Brooklyn block 585 · Court St / Union St".
  await con.run(`
    CREATE TABLE lots AS
    SELECT BoroCode::int AS boro, Block::int AS block, geom, ST_Area(geom) AS lot_ft2,
           (LandUse = '09' OR BldgClass LIKE 'Q%' OR BldgClass = 'Z8') AS open_lot,
           nullif(trim(regexp_replace(upper(coalesce(Address, '')), '^[0-9][0-9A-Z/-]*\\s+', '')), '') AS street
    FROM ST_Read(${sqlString(SHP)})
    WHERE BoroCode BETWEEN 1 AND 5 AND Block > 0;
    CREATE TABLE streets AS
    SELECT boro, block, string_agg(street, ' / ' ORDER BY n DESC, street) AS streets
    FROM (SELECT boro, block, street, count(*) AS n,
                 row_number() OVER (PARTITION BY boro, block ORDER BY count(*) DESC, street) AS k
          FROM lots WHERE street IS NOT NULL AND NOT regexp_matches(street, '^[0-9 ]+$') GROUP BY 1, 2, 3)
    WHERE k <= 2 GROUP BY 1, 2;
    CREATE TABLE blocks AS
    SELECT b.boro * 100000 + b.block AS id, b.boro, b.block,
           ['Manhattan', 'Bronx', 'Brooklyn', 'Queens', 'Staten Island'][b.boro] || ' block ' || b.block
             || CASE WHEN coalesce(b.open_share, 0) > 0.5 THEN ' · park / open space' ELSE coalesce(' · ' || s.streets, '') END AS label,
           round(ST_Area(b.geom) * 0.09290304)::int AS area_m2,
           round(ST_Perimeter(b.geom) * 0.3048)::int AS perim_m,
           -- Open space (MapPLUTO LandUse 09, Q* parks, Z8 cemeteries) or a giant
           -- block only takes points strictly inside it, never snapped street points.
           (coalesce(b.open_share, 0) > 0.5 OR ST_Area(b.geom) * 0.09290304 > ${MAX_SNAP_AREA_M2}
             OR ST_Perimeter(b.geom) * 0.3048 > ${MAX_SNAP_PERIM_M})::int AS no_snap,
           ST_Transform(b.geom, 'EPSG:2263', 'EPSG:4326', always_xy := true) AS geom
    FROM (SELECT boro, block, ST_MakeValid(ST_Union_Agg(ST_MakeValid(geom))) AS geom,
                 sum(lot_ft2) FILTER (WHERE open_lot) / nullif(sum(lot_ft2), 0) AS open_share
          FROM lots GROUP BY 1, 2) b
    LEFT JOIN streets s USING (boro, block);
    COPY (SELECT id, boro, block, label, area_m2, perim_m, no_snap, geom FROM blocks WHERE NOT ST_IsEmpty(geom))
      TO ${sqlString(RAW)} WITH (FORMAT GDAL, DRIVER 'GeoJSON');
  `);
  const n = (await con.runAndReadAll("SELECT count(*)::int AS n FROM blocks")).getRowObjectsJson()[0].n;
  console.log(`${n} tax blocks dissolved (${Date.now() - t0} ms)`);

  // keep-shapes: a small block never disappears.
  execFileSync("node_modules/.bin/mapshaper", [
    RAW, "-simplify", SIMPLIFY, "keep-shapes", "-o", GEOJSON, "format=geojson", "precision=0.000001", "force",
  ], { stdio: "inherit" });
  rmSync(RAW, { force: true });

  execFileSync("tippecanoe", [
    "-o", PMTILES, "--force", "-l", "blocks", "-Z", "10", "-z", "16",
    "--use-attribute-for-id=id", "--detect-shared-borders", "--no-tile-size-limit", GEOJSON,
  ], { stdio: "inherit" });
  for (const f of [GEOJSON, PMTILES]) console.log(`${f}: ${(statSync(f).size / 1e6).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
