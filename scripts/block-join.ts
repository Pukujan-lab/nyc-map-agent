/**
 * Point-in-block spatial join for the ingest: the window's 311 noise or crash
 * points against the real tax blocks (scripts/build-block-tiles.ts), done in
 * DuckDB spatial. Produces the same BlockCell shape the browser renders, keyed
 * by the PMTiles feature id, so the map draws one column per real block.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { BlockCell, CountPair, DatasetId } from "../src/lib/geo/types";
import { spatialDuck, sqlString } from "./duck";

/** One record, already filtered to the window. */
export interface BlockPoint {
  lat: number;
  lon: number;
  hour: number;
  /** 311 incident_address (noise) or crash on-street name. */
  place: string;
  injured: number;
  killed: number;
  cyclists: number;
}

export interface BlockJoin {
  join(dataset: DatasetId, points: BlockPoint[]): Promise<BlockCell[]>;
}

/** Same as aggregateCore: per block, the top three addresses / streets. */
const TOP = 3;
/** Street-bed points snap to a block face this close (degrees; ~40 m). */
const NEAR_DEG = 0.0004;

/**
 * @param blocksGeoJson path of nyc-blocks.geojson (id, boro, block, label)
 * @param ntaGeoJson    path of a FeatureCollection with properties.nta2020
 */
export async function blockJoin(blocksGeoJson: string, ntaGeoJson: string): Promise<BlockJoin> {
  const con: DuckDBConnection = await spatialDuck();
  await con.run(`
    CREATE TABLE blocks AS
      SELECT id::int AS id, label, geom FROM ST_Read(${sqlString(blocksGeoJson)});
    CREATE INDEX blocks_rtree ON blocks USING RTREE (geom);
    CREATE TABLE nta AS SELECT nta2020, geom FROM ST_Read(${sqlString(ntaGeoJson)});
    -- A block's neighborhood is the one holding a point inside it.
    CREATE TABLE block_meta AS
      SELECT b.id, b.label, ST_XMin(b.geom) AS w, ST_YMin(b.geom) AS s, ST_XMax(b.geom) AS e, ST_YMax(b.geom) AS n,
             any_value(n.nta2020) AS nta2020
      FROM blocks b LEFT JOIN nta n ON ST_Contains(n.geom, ST_PointOnSurface(b.geom))
      GROUP BY ALL;
  `);
  const dir = mkdtempSync(join(tmpdir(), "block-join-"));

  return {
    async join(dataset, points) {
      const csv = join(dir, `${dataset}.csv`);
      writeFileSync(
        csv,
        "lat,lon,hour,place,injured,killed,cyclists\n" +
          points.map((p) => [p.lat, p.lon, p.hour, `"${p.place.replace(/"/g, '""')}"`, p.injured, p.killed, p.cyclists].join(",")).join("\n"),
      );
      const reader = await con.runAndReadAll(`
        WITH pts AS (
          SELECT *, ST_Point(lon, lat) AS pt FROM read_csv(${sqlString(csv)}, header = true, quote = '"', escape = '"',
            columns = {'lat': 'DOUBLE', 'lon': 'DOUBLE', 'hour': 'INT', 'place': 'VARCHAR',
                       'injured': 'INT', 'killed': 'INT', 'cyclists': 'INT'})
        ), inside AS (
          SELECT b.id, p.* FROM pts p JOIN blocks b ON ST_Contains(b.geom, p.pt)
        ), street AS (
          -- 311 and NYPD geocode most points onto the street bed, between blocks:
          -- those go to the nearest block face within ${NEAR_DEG}° (~40 m).
          SELECT arg_min(b.id, ST_Distance(b.geom, p.pt)) AS id, p.lat, p.lon, p.hour, p.place, p.injured, p.killed, p.cyclists
          FROM (SELECT row_number() OVER () AS rid, * FROM pts WHERE NOT EXISTS (
                  SELECT 1 FROM blocks b WHERE ST_Contains(b.geom, pts.pt))) p
          JOIN blocks b ON ST_DWithin(b.geom, p.pt, ${NEAR_DEG})
          GROUP BY p.rid, p.lat, p.lon, p.hour, p.place, p.injured, p.killed, p.cyclists
        ), j AS (
          SELECT id, lat, lon, hour, place, injured, killed, cyclists FROM inside
          UNION ALL SELECT * FROM street
        ), places AS (
          SELECT id, list([place, n::VARCHAR] ORDER BY n DESC, place) AS top
          FROM (SELECT id, place, count(*) AS n,
                       row_number() OVER (PARTITION BY id ORDER BY count(*) DESC, place) AS k
                FROM j WHERE place <> '' GROUP BY 1, 2)
          WHERE k <= ${TOP} GROUP BY 1
        )
        SELECT j.id, m.label, m.w, m.s, m.e, m.n AS north, coalesce(m.nta2020, '') AS nta2020,
               count(*)::INT AS count, count(*) FILTER (WHERE hour >= 22 OR hour < 4)::INT AS night,
               sum(injured)::INT AS injured, sum(killed)::INT AS killed, sum(cyclists)::INT AS cyclists,
               any_value(pl.top) AS top
        FROM j JOIN block_meta m USING (id) LEFT JOIN places pl USING (id)
        GROUP BY ALL`);
      return reader.getRowObjectsJson().map((r): BlockCell => {
        const top = ((r.top as string[][] | null) ?? []).map(([k, v]): CountPair => [k, Number(v)]);
        const bbox: [number, number, number, number] = [Number(r.w), Number(r.s), Number(r.e), Number(r.north)];
        return {
          key: String(r.id),
          lon: bbox[0],
          lat: bbox[1],
          bbox,
          label: String(r.label),
          ntaCode: String(r.nta2020),
          count: Number(r.count),
          nightCount: Number(r.night),
          injured: Number(r.injured),
          killed: Number(r.killed),
          cyclists: Number(r.cyclists),
          ...(top.length ? (dataset === "noise" ? { addresses: top } : { streets: top }) : {}),
        };
      });
    },
  };
}
