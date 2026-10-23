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
import { octoQuery } from "../api/_lib/octo";
import { spatialDuck, sqlString } from "./duck";

/** nyc-blocks.geojson: BLOCKS_GEOJSON if set, else the copy published through Octo files. */
export async function publishedBlocksFile(dir: string): Promise<string> {
  if (process.env.BLOCKS_GEOJSON) return process.env.BLOCKS_GEOJSON;
  const { rows } = await octoQuery<{ parts: unknown }>("SELECT parts FROM core.published_assets WHERE name = 'nyc-blocks.geojson'");
  if (!rows[0]) throw new Error("nyc-blocks.geojson is not published: run pnpm build:block-tiles && pnpm publish:block-tiles.");
  const parts = (typeof rows[0].parts === "string" ? JSON.parse(rows[0].parts) : rows[0].parts) as Array<{ url: string }>;
  const chunks = await Promise.all(parts.map(async (p) => {
    const res = await fetch(p.url);
    if (!res.ok) throw new Error(`blocks download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }));
  const file = join(dir, "nyc-blocks.geojson");
  writeFileSync(file, Buffer.concat(chunks));
  return file;
}

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

/** Pre-rolled points: a location and how many records sit there. */
export interface WeightedPoint {
  lat: number;
  lon: number;
  n: number;
}

/** Static facts about one tax block (core.tax_blocks). */
export interface TaxBlock {
  id: number;
  label: string;
  nta2020: string;
  west: number;
  south: number;
  east: number;
  north: number;
  areaM2: number;
}

export interface BlockJoin {
  join(dataset: DatasetId, points: BlockPoint[]): Promise<BlockCell[]>;
  /** Total of `n` per block id: inside a block, else the nearest eligible block within ~40 m. */
  count(points: WeightedPoint[]): Promise<Map<number, number>>;
  blocks(): Promise<TaxBlock[]>;
}

/** Sums counts per block id from join rows; ids and counts that are not finite are dropped. */
export function sumByBlock(rows: Array<{ id: unknown; n: unknown }>): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) {
    const id = Number(r.id);
    const n = Number(r.n);
    if (!Number.isInteger(id) || !Number.isFinite(n) || n <= 0) continue;
    out.set(id, (out.get(id) ?? 0) + n);
  }
  return out;
}

/** Same as aggregateCore: per block, the top three addresses / streets. */
const TOP = 3;
/** Street-bed points snap to a block face this close (degrees; ~40 m). */
const NEAR_DEG = 0.0004;
/** A second block within 1.5x the nearest distance plus this (~8 m) faces the same street. */
const FACING_SLACK_DEG = 0.00008;

/**
 * @param blocksGeoJson path of nyc-blocks.geojson (id, boro, block, label)
 * @param ntaGeoJson    path of a FeatureCollection with properties.nta2020
 */
export async function blockJoin(blocksGeoJson: string, ntaGeoJson: string): Promise<BlockJoin> {
  const con: DuckDBConnection = await spatialDuck();
  await con.run(`
    CREATE TABLE blocks AS
      SELECT id::int AS id, label, coalesce(no_snap, 0)::int AS no_snap, coalesce(area_m2, 0)::int AS area_m2, geom FROM ST_Read(${sqlString(blocksGeoJson)});
    CREATE INDEX blocks_rtree ON blocks USING RTREE (geom);
    CREATE TABLE nta AS SELECT nta2020, geom FROM ST_Read(${sqlString(ntaGeoJson)});
    -- A block's neighborhood is the one holding a point inside it.
    CREATE TABLE block_meta AS
      SELECT b.id, b.label, b.area_m2, ST_XMin(b.geom) AS w, ST_YMin(b.geom) AS s, ST_XMax(b.geom) AS e, ST_YMax(b.geom) AS n,
             any_value(n.nta2020) AS nta2020
      FROM blocks b LEFT JOIN nta n ON ST_Contains(n.geom, ST_PointOnSurface(b.geom))
      GROUP BY ALL;
  `);
  const dir = mkdtempSync(join(tmpdir(), "block-join-"));

  return {
    async count(points) {
      if (points.length === 0) return new Map();
      const csv = join(dir, `count-${Date.now()}.csv`);
      writeFileSync(csv, "lat,lon,n\n" + points.map((p) => `${p.lat},${p.lon},${p.n}`).join("\n"));
      const reader = await con.runAndReadAll(`
        WITH pts AS (
          SELECT row_number() OVER () AS rid, *, ST_Point(lon, lat) AS pt
          FROM read_csv(${sqlString(csv)}, header = true, columns = {'lat': 'DOUBLE', 'lon': 'DOUBLE', 'n': 'DOUBLE'})
        ), inside AS (
          SELECT p.rid, b.id FROM pts p JOIN blocks b ON ST_Contains(b.geom, p.pt)
        ), near AS (
          SELECT rid, id FROM (
            SELECT p.rid, b.id, row_number() OVER (PARTITION BY p.rid ORDER BY ST_Distance(b.geom, p.pt), b.id) AS k
            FROM (SELECT * FROM pts p0 WHERE NOT EXISTS (SELECT 1 FROM inside i WHERE i.rid = p0.rid)) p
            JOIN blocks b ON ST_DWithin(b.geom, p.pt, ${NEAR_DEG}) WHERE b.no_snap = 0)
          WHERE k = 1
        ), hit AS (
          -- A point on a shared edge can sit in two blocks: credit the lowest id once.
          SELECT rid, min(id) AS id FROM (SELECT * FROM inside UNION ALL SELECT * FROM near) GROUP BY rid
        )
        SELECT h.id, sum(p.n) AS n FROM hit h JOIN pts p USING (rid) GROUP BY h.id`);
      return sumByBlock(reader.getRowObjectsJson() as Array<{ id: unknown; n: unknown }>);
    },
    async blocks() {
      const reader = await con.runAndReadAll("SELECT id, label, coalesce(nta2020, '') AS nta2020, w, s, e, n, area_m2 FROM block_meta");
      return (reader.getRowObjectsJson() as Array<Record<string, string | number>>).map((r): TaxBlock => ({
        id: Number(r.id), label: String(r.label), nta2020: String(r.nta2020),
        west: Number(r.w), south: Number(r.s), east: Number(r.e), north: Number(r.n), areaM2: Number(r.area_m2),
      }));
    },
    async join(dataset, points) {
      const csv = join(dir, `${dataset}.csv`);
      writeFileSync(
        csv,
        "lat,lon,hour,place,injured,killed,cyclists\n" +
          points.map((p) => [p.lat, p.lon, p.hour, `"${p.place.replace(/"/g, '""')}"`, p.injured, p.killed, p.cyclists].join(",")).join("\n"),
      );
      const reader = await con.runAndReadAll(`
        WITH pts AS (
          SELECT row_number() OVER () AS rid, *, ST_Point(lon, lat) AS pt FROM read_csv(${sqlString(csv)}, header = true, quote = '"', escape = '"',
            columns = {'lat': 'DOUBLE', 'lon': 'DOUBLE', 'hour': 'INT', 'place': 'VARCHAR',
                       'injured': 'INT', 'killed': 'INT', 'cyclists': 'INT'})
        ), inside AS (
          -- Strictly inside counts for every block, parks included (transverse
          -- road crashes, noise in the park).
          SELECT p.rid, b.id, 1.0 AS w FROM pts p JOIN blocks b ON ST_Contains(b.geom, p.pt)
        ), cand AS (
          -- Street-bed points: the eligible blocks (no open space, no giant
          -- blocks) within ${NEAR_DEG}° (~40 m), nearest first.
          SELECT rid, id, d,
                 row_number() OVER (PARTITION BY rid ORDER BY d, id) AS k,
                 min(d) OVER (PARTITION BY rid) AS d1
          FROM (SELECT p.rid, b.id, ST_Distance(b.geom, p.pt) AS d
                FROM (SELECT * FROM pts p0 WHERE NOT EXISTS (SELECT 1 FROM inside i WHERE i.rid = p0.rid)) p
                JOIN blocks b ON ST_DWithin(b.geom, p.pt, ${NEAR_DEG}) WHERE b.no_snap = 0)
        ), street AS (
          -- Split across the facing blocks: the nearest plus the next one when it
          -- is about as close (the block across the street), half each.
          SELECT rid, id, 1.0 / count(*) OVER (PARTITION BY rid) AS w
          FROM cand WHERE k = 1 OR (k = 2 AND d <= d1 * 1.5 + ${FACING_SLACK_DEG})
        ), j AS (
          SELECT a.id, a.w, p.hour, p.place, p.injured, p.killed, p.cyclists
          FROM (SELECT * FROM inside UNION ALL SELECT * FROM street) a JOIN pts p USING (rid)
        ), places AS (
          SELECT id, list([place, n::VARCHAR] ORDER BY n DESC, place) AS top
          FROM (SELECT id, place, round(sum(w), 1) AS n,
                       row_number() OVER (PARTITION BY id ORDER BY sum(w) DESC, place) AS k
                FROM j WHERE place <> '' GROUP BY 1, 2)
          WHERE k <= ${TOP} GROUP BY 1
        )
        SELECT j.id, m.label, m.w, m.s, m.e, m.n AS north, coalesce(m.nta2020, '') AS nta2020, m.area_m2,
               round(sum(j.w), 1) AS count, round(sum(j.w) FILTER (WHERE hour >= 22 OR hour < 4), 1) AS night,
               round(sum(j.w * injured), 1) AS injured, round(sum(j.w * killed), 1) AS killed,
               round(sum(j.w * cyclists), 1) AS cyclists, any_value(pl.top) AS top
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
          nightCount: Number(r.night ?? 0),
          areaM2: Number(r.area_m2),
          injured: Number(r.injured),
          killed: Number(r.killed),
          cyclists: Number(r.cyclists),
          ...(top.length ? (dataset === "noise" ? { addresses: top } : { streets: top }) : {}),
        };
      });
    },
  };
}
