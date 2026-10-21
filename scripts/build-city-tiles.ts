/**
 * Builds the static tiles for the textured 3D city (pilot area) from NYC Open Data:
 *   buildings  Building Footprints (5zhs-2jue) heights + PLUTO (64uk-42ks) class/floors/year
 *   props      street trees (uvpi-gqnh), hydrants (5bgh-vtsn), benches (kuxa-tauh),
 *              street-light poles reserved for small cells (tbgj-tdd6)
 * Props become tiny low-poly polygons (canopy octagon, trunk, pole, box) so MapLibre's own
 * fill-extrusion draws them: no second renderer. tippecanoe packs everything into one
 * PMTiles file served statically from public/tiles/.
 *
 *   pnpm build:city-tiles                       full city -> public/tiles/nyc-city.pmtiles (gitignored)
 *   CITY3D_AREA=pilot pnpm build:city-tiles     small pilot -> public/tiles/nyc-city-pilot.pmtiles
 * Needs tippecanoe >= 2.17 on PATH.
 */
import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, statSync, writeSync } from "node:fs";

/** Original pilot bbox: Lower Manhattan, DUMBO, Brooklyn Heights, Downtown Brooklyn, Park Slope. */
export const PILOT_ONLY_BBOX = { west: -74.02, south: 40.665, east: -73.97, north: 40.74 };
/** All five boroughs. Buildings are NYC data only, so the NJ corner of the box stays empty. */
export const NYC_BBOX = { west: -74.26, south: 40.49, east: -73.69, north: 40.92 };
/** `CITY3D_AREA=pilot` rebuilds the small pilot; the default covers the whole city. */
const AREA = process.env.CITY3D_AREA === "pilot" ? "pilot" : "nyc";
export const PILOT_BBOX = AREA === "pilot" ? PILOT_ONLY_BBOX : NYC_BBOX;
const OUT = AREA === "pilot" ? "public/tiles/nyc-city-pilot.pmtiles" : "public/tiles/nyc-city.pmtiles";
const SOCRATA = "https://data.cityofnewyork.us/resource";
const FT = 0.3048;

type Row = Record<string, unknown>;

async function soqlAll(dataset: string, params: Record<string, string>): Promise<Row[]> {
  const out: Row[] = [];
  const headers: Record<string, string> = {};
  const { SOCRATA_KEY_ID: id, SOCRATA_KEY_SECRET: secret } = process.env;
  if (id && secret) headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  for (let offset = 0; ; offset += 50_000) {
    const q = new URLSearchParams({ ...params, $limit: "50000", $offset: String(offset), $order: ":id" });
    const res = await fetch(`${SOCRATA}/${dataset}.json?${q}`, { headers });
    if (!res.ok) throw new Error(`${dataset} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = (await res.json()) as Row[];
    out.push(...rows);
    if (rows.length < 50_000) return out;
  }
}

const box = (col: string) =>
  `within_box(${col}, ${PILOT_BBOX.north}, ${PILOT_BBOX.west}, ${PILOT_BBOX.south}, ${PILOT_BBOX.east})`;
const latLonBox = (lat = "latitude", lon = "longitude") =>
  `${lat}::number between ${PILOT_BBOX.south} and ${PILOT_BBOX.north} and ${lon}::number between ${PILOT_BBOX.west} and ${PILOT_BBOX.east}`;
const inBox = (lat: number, lon: number) =>
  lat >= PILOT_BBOX.south && lat <= PILOT_BBOX.north && lon >= PILOT_BBOX.west && lon <= PILOT_BBOX.east;

export type Facade = "rowhouse" | "walkup" | "prewar" | "modern" | "tower";

/** Picks a facade from PLUTO building class, floors, height and year. */
export function classify(p: { bldgclass?: string; floors: number; heightM: number; year?: number }): {
  facade: Facade;
  storefront: boolean;
} {
  const cls = (p.bldgclass ?? "").toUpperCase();
  const k = cls.charAt(0);
  const storefront = /^(S|K)/.test(cls) || ["C7", "D6", "D7", "O8", "RR"].includes(cls);
  let facade: Facade;
  if (p.heightM > 70 || (k === "O" && p.floors > 15) || k === "H" && p.floors > 15) facade = "tower";
  else if ((k === "A" || k === "B" || k === "S") && p.floors <= 4) facade = "rowhouse";
  else if (k === "C" || (p.floors <= 6 && (p.year ?? 1900) < 1940)) facade = "walkup";
  else if ((p.year ?? 1900) < 1950) facade = "prewar";
  else facade = "modern";
  return { facade, storefront };
}

function ring(lon: number, lat: number, radiusM: number, sides: number, rot = 0): number[][] {
  const mLat = 1 / 111_320;
  const mLon = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const pts: number[][] = [];
  for (let i = 0; i <= sides; i++) {
    const a = rot + (i % sides) * ((2 * Math.PI) / sides);
    pts.push([+(lon + Math.cos(a) * radiusM * mLon).toFixed(7), +(lat + Math.sin(a) * radiusM * mLat).toFixed(7)]);
  }
  return pts;
}

function prop(kind: string, lon: number, lat: number, r: number, sides: number, base: number, height: number) {
  return {
    type: "Feature",
    tippecanoe: { layer: "props", minzoom: 16 },
    properties: { kind, base, height },
    geometry: { type: "Polygon", coordinates: [ring(lon, lat, r, sides, Math.PI / sides)] },
  };
}

async function main() {
  const t0 = Date.now();
  const [footprints, pluto, trees, hydrants, benches, poles] = await Promise.all([
    soqlAll("5zhs-2jue", { $select: "the_geom,base_bbl,height_roof,construction_year", $where: box("the_geom") }),
    soqlAll("64uk-42ks", {
      $select: "bbl,bldgclass,numfloors,yearbuilt",
      $where: `latitude between ${PILOT_BBOX.south} and ${PILOT_BBOX.north} and longitude between ${PILOT_BBOX.west} and ${PILOT_BBOX.east}`,
    }),
    soqlAll("uvpi-gqnh", { $select: "latitude,longitude,tree_dbh", $where: `status='Alive' and ${latLonBox()}` }),
    soqlAll("5bgh-vtsn", { $select: "latitude,longitude", $where: latLonBox() }),
    soqlAll("kuxa-tauh", { $select: "the_geom" }),
    soqlAll("tbgj-tdd6", { $select: "latitude,longitude", $where: latLonBox() }).catch(() => []),
  ]);
  const plutoByBbl = new Map(pluto.map((p) => [String(Number(p.bbl)), p]));
  const lines: string[] = [];
  const counts: Record<string, number> = {};
  const add = (f: object, kind: string) => {
    lines.push(JSON.stringify(f));
    counts[kind] = (counts[kind] ?? 0) + 1;
  };

  for (const f of footprints) {
    const heightM = Number(f.height_roof ?? 0) * FT;
    if (!(heightM > 2)) continue;
    const p = plutoByBbl.get(String(Number(f.base_bbl)));
    const floors = Number(p?.numfloors ?? 0) || Math.max(1, Math.round(heightM / 3.3));
    const year = Number(p?.yearbuilt ?? f.construction_year ?? 0) || undefined;
    const { facade, storefront } = classify({ bldgclass: p?.bldgclass as string | undefined, floors, heightM, year });
    add(
      {
        type: "Feature",
        tippecanoe: { layer: "buildings", minzoom: 14 },
        properties: { h: Math.round(heightM * 10) / 10, facade, store: storefront ? 1 : 0 },
        geometry: f.the_geom,
      },
      `building:${facade}`,
    );
  }
  for (const t of trees) {
    const lat = Number(t.latitude), lon = Number(t.longitude);
    if (!inBox(lat, lon)) continue;
    const dbh = Math.min(40, Math.max(3, Number(t.tree_dbh) || 8));
    const canopy = 1.4 + dbh * 0.09;
    add(prop("trunk", lon, lat, 0.18, 4, 0, 2.6), "tree");
    lines.push(JSON.stringify(prop("canopy", lon, lat, canopy, 6, 2.4, 2.4 + canopy * 2.2)));
  }
  for (const h of hydrants) {
    const lat = Number(h.latitude), lon = Number(h.longitude);
    if (inBox(lat, lon)) add(prop("hydrant", lon, lat, 0.22, 6, 0, 0.8), "hydrant");
  }
  for (const b of benches) {
    const c = (b.the_geom as { coordinates?: number[] } | undefined)?.coordinates;
    if (c && inBox(c[1], c[0])) add(prop("bench", c[0], c[1], 0.9, 4, 0.35, 0.8), "bench");
  }
  for (const s of poles) {
    const lat = Number(s.latitude), lon = Number(s.longitude);
    if (!inBox(lat, lon)) continue;
    add(prop("pole", lon, lat, 0.12, 4, 0, 8), "streetlight");
    lines.push(JSON.stringify(prop("lamp", lon, lat, 0.45, 4, 7.6, 8.1)));
  }

  mkdirSync("public/tiles", { recursive: true });
  const seq = `/tmp/${AREA}-city.geojsonseq`;
  // Streamed: the citywide feature list is larger than one JS string can hold.
  const fd = openSync(seq, "w");
  for (const line of lines) writeSync(fd, line + "\n");
  closeSync(fd);
  const out = OUT;
  execFileSync("tippecanoe", [
    "-o", out, "--force", "-Z14", "-z16", "--read-parallel", "-P",
    "--no-tile-size-limit", "--no-feature-limit", "--detect-shared-borders",
    "--simplification=2", seq,
  ], { stdio: "inherit" });
  console.log(JSON.stringify({ counts, bytes: statSync(out).size, ms: Date.now() - t0 }));
}

if (process.argv[1]?.endsWith("build-city-tiles.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
