/**
 * Builds the static tiles for the textured 3D city (pilot area) from NYC Open Data:
 *   buildings  Building Footprints (5zhs-2jue) heights + PLUTO (64uk-42ks) class/floors/year
 *   props      street trees (uvpi-gqnh), hydrants (5bgh-vtsn), benches (kuxa-tauh),
 *              street-light poles reserved for small cells (tbgj-tdd6), pushed off the
 *              roadway to the kerb with DCP LION widths (scripts/props-clearance.sql)
 *   storefronts named OSM shops/amenities (Geofabrik NY + osmium, ODbL) on their facade, scripts/storefronts.ts
 *   schools    DOE School Point Locations (a3nt-yts4, LCGMS) spatially joined to the
 *              nearest footprint with DuckDB spatial (PLUTO class W* is the fallback)
 * Props become tiny low-poly polygons (canopy octagon, trunk, pole, box) so MapLibre's own
 * fill-extrusion draws them: no second renderer. tippecanoe packs everything into one
 * PMTiles file served statically from public/tiles/.
 *
 *   pnpm build:city-tiles                       full city -> public/tiles/nyc-city.pmtiles (gitignored)
 *   CITY3D_AREA=pilot pnpm build:city-tiles     small pilot -> public/tiles/nyc-city-pilot.pmtiles
 * Needs tippecanoe >= 2.17 and the duckdb CLI (>= 1.1, spatial extension) on PATH.
 */
import { execFileSync } from "node:child_process";
import { storefrontFeatures } from "./storefronts";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync, writeSync } from "node:fs";

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
    // A citywide pull is hundreds of pages; one dropped socket must not sink it.
    let rows: Row[] | null = null;
    for (let attempt = 1; !rows; attempt++) {
      try {
        const res = await fetch(`${SOCRATA}/${dataset}.json?${q}`, { headers });
        if (!res.ok) throw new Error(`${dataset} ${res.status}: ${(await res.text()).slice(0, 200)}`);
        rows = (await res.json()) as Row[];
      } catch (err) {
        if (attempt >= 4) throw err;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
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

export type Facade =
  | "rowhouse" | "brownstone" | "walkup" | "prewar" | "limestone" | "castiron" | "modern" | "tower" | "glass" | "school";

/** SoHo / Tribeca cast-iron districts (rough box). */
export const CAST_IRON_BBOX = { west: -74.0125, south: 40.714, east: -73.996, north: 40.7275 };
const inCastIron = (lon?: number, lat?: number) =>
  lon !== undefined && lat !== undefined &&
  lon >= CAST_IRON_BBOX.west && lon <= CAST_IRON_BBOX.east && lat >= CAST_IRON_BBOX.south && lat <= CAST_IRON_BBOX.north;

/** Picks a facade from PLUTO building class, floors, height and year. */
export function classify(p: {
  bldgclass?: string; floors: number; heightM: number; year?: number; school?: boolean; lon?: number; lat?: number;
}): {
  facade: Facade;
  storefront: boolean;
} {
  const cls = (p.bldgclass ?? "").toUpperCase();
  const k = cls.charAt(0);
  const storefront = /^(S|K)/.test(cls) || ["C7", "D6", "D7", "O8", "RR"].includes(cls);
  let facade: Facade;
  // A DOE school point on the footprint, or PLUTO class W* (educational).
  const year = p.year ?? 1900;
  if (p.school || k === "W") facade = "school";
  // Post-1960 supertalls read as glass curtain walls; prewar towers as limestone.
  else if (p.heightM > 100 && year >= 1960) facade = "glass";
  else if (p.heightM > 40 && year < 1950) facade = "limestone";
  else if (p.heightM > 70 || (k === "O" && p.floors > 15) || k === "H" && p.floors > 15) facade = "tower";
  else if (inCastIron(p.lon, p.lat) && year < 1915 && p.floors >= 3 && p.floors <= 8 && k !== "A" && k !== "B") facade = "castiron";
  else if ((k === "A" || k === "B" || k === "S") && p.floors <= 4) facade = year < 1910 ? "brownstone" : "rowhouse";
  else if (k === "C" || (p.floors <= 6 && year < 1940)) facade = "walkup";
  else if (year < 1950) facade = "prewar";
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

/** A box `lenM` x `widthM` turned to `bearing` (degrees from north), for benches. */
function rect(lon: number, lat: number, lenM: number, widthM: number, bearing: number, offsetM = 0): number[][] {
  const mLat = 1 / 111_320;
  const mLon = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const b = (bearing * Math.PI) / 180;
  const along = [Math.sin(b), Math.cos(b)];
  const across = [Math.cos(b), -Math.sin(b)];
  const pt = (u: number, v: number) => {
    const e = along[0] * u + across[0] * (v + offsetM);
    const n = along[1] * u + across[1] * (v + offsetM);
    return [+(lon + e * mLon).toFixed(7), +(lat + n * mLat).toFixed(7)];
  };
  const l = lenM / 2, w = widthM / 2;
  return [pt(-l, -w), pt(l, -w), pt(l, w), pt(-l, w), pt(-l, -w)];
}

function slab(kind: string, coords: number[][], base: number, height: number) {
  return {
    type: "Feature",
    tippecanoe: { layer: "props", minzoom: 16 },
    properties: { kind, base, height },
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

interface Placed { lon: number; lat: number; brg: number; pushed: boolean }

/**
 * Pushes props that sit on the carriageway out to the kerb (and drops any on the
 * centreline) using DCP LION street widths; see scripts/props-clearance.sql.
 * Without LION on disk (`pnpm build:sign-tiles` downloads it) props pass through.
 */
function clearOfRoads(points: Array<{ kind: string; lon: number; lat: number }>): Map<number, Placed> | null {
  const gdb = process.env.LION_GDB ?? "/tmp/nyc-lion/lion/lion.gdb";
  if (!existsSync(gdb)) {
    console.warn(`no LION at ${gdb}: props are not checked against the roadway`);
    return null;
  }
  const dir = "/tmp/nyc-props";
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/in.csv`, "id,kind,lon,lat\n" + points.map((q, i) => `${i},${q.kind},${q.lon},${q.lat}`).join("\n"));
  writeFileSync(`${dir}/clear.sql`, readFileSync("scripts/props-clearance.sql", "utf8").replace("PROPS_OUT_PLACEHOLDER", `${dir}/out.csv`));
  execFileSync("duckdb", ["-c", `.read ${dir}/clear.sql`], {
    stdio: "inherit",
    env: { ...process.env, LION_GDB: gdb, PROPS_IN: `${dir}/in.csv` },
  });
  const out = new Map<number, Placed>();
  for (const line of readFileSync(`${dir}/out.csv`, "utf8").trim().split("\n").slice(1)) {
    const [id, lon, lat, brg, pushed] = line.split(",");
    out.set(Number(id), { lon: Number(lon), lat: Number(lat), brg: Number(brg), pushed: pushed === "true" });
  }
  return out;
}

function prop(kind: string, lon: number, lat: number, r: number, sides: number, base: number, height: number) {
  return {
    type: "Feature",
    tippecanoe: { layer: "props", minzoom: 16 },
    properties: { kind, base, height },
    geometry: { type: "Polygon", coordinates: [ring(lon, lat, r, sides, Math.PI / sides)] },
  };
}

function writeLines(path: string, lines: Iterable<string>): void {
  const fd = openSync(path, "w");
  for (const line of lines) writeSync(fd, line + "\n");
  closeSync(fd);
}

/**
 * Footprint indexes that hold a DOE school point: DuckDB spatial joins each
 * school to the footprint containing it, else the nearest one within ~25 m
 * (points often sit on the frontage or in the yard).
 */
export function schoolFootprints(footprints: Row[], schools: Row[]): Map<number, string> {
  const fp = `/tmp/${AREA}-footprints.ndjson`, sp = `/tmp/${AREA}-schools.ndjson`, out = `/tmp/${AREA}-school-bins.csv`;
  writeLines(fp, (function* () {
    for (let i = 0; i < footprints.length; i++) if (footprints[i].the_geom) yield JSON.stringify({ i, g: JSON.stringify(footprints[i].the_geom) });
  })());
  writeLines(sp, schools.map((s, j) => JSON.stringify({ j, g: JSON.stringify(s.the_geom) })));
  const sql = `INSTALL spatial; LOAD spatial;
    CREATE TABLE f AS SELECT i, ST_GeomFromGeoJSON(g) AS geom FROM read_json('${fp}', format = 'newline_delimited', columns = {i: 'INTEGER', g: 'VARCHAR'});
    CREATE TABLE s AS SELECT j, ST_GeomFromGeoJSON(g) AS p FROM read_json('${sp}', format = 'newline_delimited', columns = {j: 'INTEGER', g: 'VARCHAR'});
    COPY (SELECT i, any_value(j) FROM (
      SELECT f.i, s.j, row_number() OVER (PARTITION BY s.j ORDER BY ST_Distance(f.geom, s.p)) AS rk
      FROM s JOIN f ON ST_DWithin(f.geom, s.p, 0.00025)) WHERE rk = 1 GROUP BY i) TO '${out}' (HEADER false);`;
  execFileSync("duckdb", ["-c", sql], { stdio: ["ignore", "ignore", "inherit"] });
  const name = (j: number) => (typeof schools[j]?.loc_name === "string" ? schools[j].loc_name : "School").trim();
  return new Map(readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => {
    const [i, j] = l.split(",").map(Number);
    return [i, name(j)];
  }));
}

/** Parsed OSM height in metres ("120", "120 m", "394'"), or undefined. */
export function osmHeight(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.trim().match(/^(-?[\d.]+)\s*(m|ft|')?$/);
  if (!m) return undefined;
  const n = Number(m[1]) * (m[2] === "ft" || m[2] === "'" ? FT : 1);
  return Number.isFinite(n) ? n : undefined;
}

interface Part { i: number; base: number; h: number; geom: unknown }

/**
 * OSM building:part massing (setbacks, spires, podiums): DuckDB spatial puts
 * each part on the footprint holding its centre; footprints with 2+ tagged
 * parts are drawn as those parts instead of one box. Parts come from the
 * Geofabrik New York extract (ODbL): `osmium tags-filter new-york-latest.osm.pbf
 * w/building:part r/building:part -o /tmp/nyc-parts.pbf`. Without it, boxes stay.
 */
export function buildingParts(footprints: Row[]): Map<number, Part[]> {
  const pbf = process.env.OSM_PARTS_PBF ?? "/tmp/nyc-parts.pbf";
  const out = new Map<number, Part[]>();
  if (!existsSync(pbf)) {
    console.warn(`no OSM parts at ${pbf}: footprints stay single boxes`);
    return out;
  }
  const seq = `/tmp/${AREA}-parts.geojsonseq`, pp = `/tmp/${AREA}-parts.ndjson`, fp = `/tmp/${AREA}-footprints.ndjson`, res = `/tmp/${AREA}-parts-on.csv`;
  execFileSync("osmium", ["export", pbf, "-f", "geojsonseq", "-o", seq, "--overwrite"], { stdio: ["ignore", "ignore", "inherit"] });
  const parts: Array<{ base: number; h: number; geom: unknown }> = [];
  for (const line of readFileSync(seq, "utf8").split("\n")) {
    const t = line.split(String.fromCharCode(30)).join("").trim();
    if (!t) continue;
    const f = JSON.parse(t) as { geometry: { type: string }; properties: Record<string, unknown> };
    const pr = f.properties;
    if (!pr["building:part"] || !/Polygon/.test(f.geometry.type)) continue;
    const lv = Number(pr["building:levels"]), minLv = Number(pr["building:min_level"]);
    const h = osmHeight(pr.height) ?? (lv > 0 ? lv * 3.3 : undefined);
    if (!h || h < 2) continue;
    const base = osmHeight(pr.min_height) ?? (minLv > 0 ? minLv * 3.3 : 0);
    if (base >= h) continue;
    parts.push({ base, h, geom: f.geometry });
  }
  writeLines(pp, parts.map((q, j) => JSON.stringify({ j, g: JSON.stringify(q.geom) })));
  if (!existsSync(fp)) writeLines(fp, (function* () {
    for (let i = 0; i < footprints.length; i++) if (footprints[i].the_geom) yield JSON.stringify({ i, g: JSON.stringify(footprints[i].the_geom) });
  })());
  const sql = `INSTALL spatial; LOAD spatial;
    CREATE TABLE f AS SELECT i, ST_GeomFromGeoJSON(g) AS geom FROM read_json('${fp}', format = 'newline_delimited', columns = {i: 'INTEGER', g: 'VARCHAR'});
    CREATE TABLE p AS SELECT j, ST_PointOnSurface(ST_GeomFromGeoJSON(g)) AS c FROM read_json('${pp}', format = 'newline_delimited', columns = {j: 'INTEGER', g: 'VARCHAR'});
    COPY (SELECT f.i, p.j FROM p JOIN f ON ST_Contains(f.geom, p.c)) TO '${res}' (HEADER false);`;
  execFileSync("duckdb", ["-c", sql], { stdio: ["ignore", "ignore", "inherit"] });
  for (const l of readFileSync(res, "utf8").split("\n").filter(Boolean)) {
    const [i, j] = l.split(",").map(Number);
    const list = out.get(i) ?? [];
    list.push({ i, ...parts[j] });
    out.set(i, list);
  }
  for (const [i, list] of out) if (list.length < 2) out.delete(i);
  return out;
}

/** Rough ring centre (vertex mean) of a footprint, or undefined. */
function centre(geom: unknown): [number, number] | undefined {
  const g = geom as { type?: string; coordinates?: unknown } | undefined;
  const ring = (g?.type === "Polygon" ? (g.coordinates as number[][][])[0]
    : g?.type === "MultiPolygon" ? (g.coordinates as number[][][][])[0]?.[0] : undefined);
  if (!ring?.length) return undefined;
  let x = 0, y = 0;
  const n = ring.length - 1 || 1;
  for (let k = 0; k < n; k++) { x += ring[k][0]; y += ring[k][1]; }
  return [x / n, y / n];
}

/** Manhattan (and nearby) prewar mid-rises get the classic rooftop wooden water tank. */
export function wantsWaterTower(p: { facade: Facade; floors: number; year?: number; i: number }): boolean {
  if (!["walkup", "prewar", "limestone", "castiron"].includes(p.facade)) return false;
  if (p.floors < 6 || p.floors > 22 || (p.year ?? 1900) >= 1960) return false;
  return p.i % 3 === 0; // about one roof in three, deterministic
}

async function main() {
  const t0 = Date.now();
  const [footprints, pluto, trees, hydrants, benches, poles, schools] = await Promise.all([
    soqlAll("5zhs-2jue", { $select: "the_geom,base_bbl,height_roof,construction_year", $where: box("the_geom") }),
    soqlAll("64uk-42ks", {
      $select: "bbl,bldgclass,numfloors,yearbuilt",
      $where: `latitude between ${PILOT_BBOX.south} and ${PILOT_BBOX.north} and longitude between ${PILOT_BBOX.west} and ${PILOT_BBOX.east}`,
    }),
    soqlAll("uvpi-gqnh", { $select: "latitude,longitude,tree_dbh", $where: `status='Alive' and ${latLonBox()}` }),
    soqlAll("5bgh-vtsn", { $select: "latitude,longitude", $where: latLonBox() }),
    soqlAll("kuxa-tauh", { $select: "the_geom" }),
    soqlAll("tbgj-tdd6", { $select: "latitude,longitude", $where: latLonBox() }).catch(() => []),
    soqlAll("a3nt-yts4", { $select: "the_geom,loc_name", $where: box("the_geom") }),
  ]);
  const schoolIdx = schoolFootprints(footprints, schools);
  const partsOf = buildingParts(footprints);
  const plutoByBbl = new Map(pluto.map((p) => [String(Number(p.bbl)), p]));
  const lines: string[] = [];
  const counts: Record<string, number> = {};
  const add = (f: object, kind: string) => {
    lines.push(JSON.stringify(f));
    counts[kind] = (counts[kind] ?? 0) + 1;
  };

  for (const [i, f] of footprints.entries()) {
    const heightM = Number(f.height_roof ?? 0) * FT;
    if (!(heightM > 2)) continue;
    const p = plutoByBbl.get(String(Number(f.base_bbl)));
    const floors = Number(p?.numfloors ?? 0) || Math.max(1, Math.round(heightM / 3.3));
    const year = Number(p?.yearbuilt ?? f.construction_year ?? 0) || undefined;
    const c = centre(f.the_geom);
    const { facade, storefront } = classify({
      bldgclass: p?.bldgclass as string | undefined, floors, heightM, year, school: schoolIdx.has(i), lon: c?.[0], lat: c?.[1],
    });
    const school = schoolIdx.has(i) ? { school: schoolIdx.get(i) } : {};
    const parts = partsOf.get(i);
    if (parts) {
      for (const pt of parts) add({
        type: "Feature",
        tippecanoe: { layer: "buildings", minzoom: 14 },
        properties: {
          h: Math.round(pt.h * 10) / 10, base: Math.round(pt.base * 10) / 10, facade,
          store: storefront && pt.base === 0 ? 1 : 0, ...school,
        },
        geometry: pt.geom,
      }, "building-part");
      counts[`building:${facade}`] = (counts[`building:${facade}`] ?? 0) + 1;
    } else {
      add(
        {
          type: "Feature",
          tippecanoe: { layer: "buildings", minzoom: 14 },
          properties: { h: Math.round(heightM * 10) / 10, facade, store: storefront ? 1 : 0, ...school },
          geometry: f.the_geom,
        },
        `building:${facade}`,
      );
    }
    // Rooftop water tank: legs, a wooden barrel and a conical cap (props layer, z16).
    if (c && !parts && wantsWaterTower({ facade, floors, year, i })) {
      const [lon, lat] = c, top = heightM;
      for (const a of [0, 1, 2, 3]) {
        const rot = (a * Math.PI) / 2 + Math.PI / 4;
        const lx = lon + (Math.cos(rot) * 1.3) / (111_320 * Math.cos((lat * Math.PI) / 180)), ly = lat + (Math.sin(rot) * 1.3) / 111_320;
        lines.push(JSON.stringify(prop("tankleg", lx, ly, 0.15, 4, top, top + 2.5)));
      }
      add(prop("tank", lon, lat, 1.9, 10, top + 2.5, top + 7), "watertower");
      lines.push(JSON.stringify(prop("tankroof", lon, lat, 2.05, 10, top + 7, top + 7.4)));
      lines.push(JSON.stringify(prop("tankroof", lon, lat, 1.2, 10, top + 7.4, top + 8.2)));
    }
  }
  // Storefront signboards (OSM, ODbL): reuse the footprints file the school join wrote.
  if (process.env.CITY3D_SIGNS !== "0") {
    for (const f of storefrontFeatures(PILOT_BBOX, `/tmp/${AREA}-footprints.ndjson`, AREA)) add(f, "storefront-sign");
  }
  // Small school icons (optional chip): the DOE point itself, with its name.
  for (const sc of schools) {
    const c = (sc.the_geom as { coordinates?: number[] } | undefined)?.coordinates;
    if (c && inBox(c[1], c[0])) add({
      type: "Feature", tippecanoe: { layer: "schools", minzoom: 14 },
      properties: { name: (typeof sc.loc_name === "string" ? sc.loc_name : "School").trim() },
      geometry: { type: "Point", coordinates: c },
    }, "school-point");
  }
  // Street props, checked against the roadway first so none stands in the street.
  const pts: Array<{ kind: string; lon: number; lat: number; dbh?: number }> = [];
  for (const t of trees) {
    const lat = Number(t.latitude), lon = Number(t.longitude);
    if (inBox(lat, lon)) pts.push({ kind: "tree", lon, lat, dbh: Number(t.tree_dbh) });
  }
  for (const h of hydrants) {
    const lat = Number(h.latitude), lon = Number(h.longitude);
    if (inBox(lat, lon)) pts.push({ kind: "hydrant", lon, lat });
  }
  for (const b of benches) {
    const c = (b.the_geom as { coordinates?: number[] } | undefined)?.coordinates;
    if (c && inBox(c[1], c[0])) pts.push({ kind: "bench", lon: c[0], lat: c[1] });
  }
  for (const s of poles) {
    const lat = Number(s.latitude), lon = Number(s.longitude);
    if (inBox(lat, lon)) pts.push({ kind: "streetlight", lon, lat });
  }
  const placed = clearOfRoads(pts);
  let pushed = 0, dropped = 0;
  pts.forEach((q, i) => {
    const at = placed ? placed.get(i) : { lon: q.lon, lat: q.lat, brg: 0, pushed: false };
    if (!at) return void dropped++;
    if (at.pushed) pushed++;
    const { lon, lat } = at;
    if (q.kind === "tree") {
      const dbh = Math.min(40, Math.max(3, q.dbh || 8));
      const canopy = 1.4 + dbh * 0.09;
      add(prop("trunk", lon, lat, 0.15, 6, 0, 2.8), "tree");
      // Three stacked, narrowing tiers read as a crown, not a cube.
      const top = 2.4 + canopy * 2.2;
      const tiers: Array<[number, number, number]> = [[0.75, 2.4, 0.45], [1, 0.45, 0.8], [0.55, 0.8, 1]];
      for (const [scale, from, to] of tiers) {
        const base = from > 1 ? from : 2.4 + (top - 2.4) * from;
        lines.push(JSON.stringify(prop("canopy", lon, lat, canopy * scale, 10, base, 2.4 + (top - 2.4) * to)));
      }
    } else if (q.kind === "hydrant") {
      add(prop("hydrant", lon, lat, 0.22, 6, 0, 0.8), "hydrant");
    } else if (q.kind === "bench") {
      // Along the kerb: a seat on two legs and a backrest, not a 2 m crate.
      add(slab("bench", rect(lon, lat, 1.8, 0.45, at.brg), 0.42, 0.48), "bench");
      lines.push(JSON.stringify(slab("bench", rect(lon, lat, 1.8, 0.06, at.brg, 0.2), 0.48, 0.9)));
      for (const u of [-0.75, 0.75]) {
        const e = Math.sin((at.brg * Math.PI) / 180) * u, n = Math.cos((at.brg * Math.PI) / 180) * u;
        const c = [lon + e / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + n / 111_320];
        lines.push(JSON.stringify(slab("pole", rect(c[0], c[1], 0.08, 0.4, at.brg), 0, 0.42)));
      }
    } else {
      add(prop("pole", lon, lat, 0.12, 4, 0, 8), "streetlight");
      lines.push(JSON.stringify(prop("lamp", lon, lat, 0.45, 4, 7.6, 8.1)));
    }
  });
  counts["props:pushed-to-kerb"] = pushed;
  counts["props:dropped-on-centreline"] = dropped;

  mkdirSync("public/tiles", { recursive: true });
  const seq = `/tmp/${AREA}-city.geojsonseq`;
  // Streamed: the citywide feature list is larger than one JS string can hold.
  writeLines(seq, lines);
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
