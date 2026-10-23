/**
 * Self-hosted NYC buildings as static 3D Tiles (issue #11): no Google
 * photorealistic tiles, so no per-request cost and no terms that forbid caching.
 *
 * Building Footprints (NYC Open Data 5zhs-2jue) are fetched for one borough,
 * each footprint is extruded to its roof height, and the buildings are grouped
 * into a flat grid of GLB tiles under one tileset.json (3D Tiles 1.1, glTF
 * content, ADD refinement). Output is plain static files: host it anywhere.
 *
 *   pnpm build:3dtiles brooklyn            # -> public/tiles/3d/brooklyn/tileset.json
 *   BUILD_3DTILES_CELL_M=500 pnpm build:3dtiles manhattan
 *
 * Prerequisites (nothing is installed by this script):
 *   - Node 20+ with `fetch` and network access to data.cityofnewyork.us
 *   - optional SOCRATA_KEY_ID / SOCRATA_KEY_SECRET for a higher rate limit
 *   No py3dtiles, tippecanoe or GDAL is needed. Validate the result with
 *   `npx 3d-tiles-validator --tilesetFile <out>/tileset.json` (not run here).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  BOROUGHS,
  boroughCode,
  boundingBox,
  buildTileset,
  cleanRing,
  emptyMesh,
  extrudeRing,
  gridCells,
  heightMeters,
  meshToGlb,
  toLocalMeters,
  type LonLat,
  type Origin,
  type Placed,
} from "./tiles3d-geometry";

const SOCRATA = "https://data.cityofnewyork.us/resource/5zhs-2jue.json";
const OUT_ROOT = process.env.BUILD_3DTILES_OUT ?? "public/tiles/3d";
const CELL_M = Number(process.env.BUILD_3DTILES_CELL_M ?? 1000);
const PAGE = 50_000;

interface Row {
  the_geom?: { type: string; coordinates: unknown };
  height_roof?: string;
}

const PREREQS = [
  "Node 20+ (global fetch)",
  "network access to data.cityofnewyork.us (Building Footprints 5zhs-2jue)",
  "optional: SOCRATA_KEY_ID and SOCRATA_KEY_SECRET to avoid throttling",
];
const prereqText = () => `Prerequisites:\n${PREREQS.map((p) => `  - ${p}`).join("\n")}`;

/** Outer rings (lon/lat) of a Polygon or MultiPolygon geometry; holes are dropped. */
export function outerRings(geom: Row["the_geom"]): LonLat[][] {
  if (!geom) return [];
  if (geom.type === "Polygon") return [(geom.coordinates as LonLat[][])[0] ?? []];
  if (geom.type === "MultiPolygon") return (geom.coordinates as LonLat[][][]).map((p) => p[0] ?? []);
  return [];
}

async function fetchBorough(code: number): Promise<Row[]> {
  const headers: Record<string, string> = {};
  const { SOCRATA_KEY_ID: id, SOCRATA_KEY_SECRET: secret } = process.env;
  if (id && secret) headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const out: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const q = new URLSearchParams({
      $select: "the_geom,height_roof",
      $where: `base_bbl like '${code}%' AND the_geom IS NOT NULL`,
      $limit: String(PAGE),
      $offset: String(offset),
      $order: ":id",
    });
    const res = await fetch(`${SOCRATA}?${q}`, { headers });
    if (!res.ok) throw new Error(`5zhs-2jue ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = (await res.json()) as Row[];
    out.push(...rows);
    console.log(`fetched ${out.length} footprints`);
    if (rows.length < PAGE) return out;
  }
}

async function main() {
  const name = (process.argv[2] ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  const code = boroughCode(name);
  if (!code) {
    console.error(`Usage: pnpm build:3dtiles <${Object.keys(BOROUGHS).join("|")}>\n\n${prereqText()}`);
    process.exit(2);
  }
  let rows: Row[];
  try {
    rows = await fetchBorough(code);
  } catch (err) {
    throw new Error(`Could not fetch footprints (${err instanceof Error ? err.message : err}).\n${prereqText()}`);
  }
  const lonlat = rows.flatMap((r) => outerRings(r.the_geom).map((ring) => ({ ring, h: heightMeters(r.height_roof) })));
  const first = lonlat.find((b) => b.ring[0])?.ring[0];
  if (!first) throw new Error("no footprints returned");
  const origin: Origin = { lon: first[0], lat: first[1] };
  const placed: Placed[] = [];
  for (const b of lonlat) {
    const ring = cleanRing(b.ring.map((p) => toLocalMeters(p, origin)));
    if (ring) placed.push({ ring, heightM: b.h });
  }

  const outDir = `${OUT_ROOT}/${name}`;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const tiles: Array<{ uri: string; box: number[] }> = [];
  for (const cell of gridCells(placed, CELL_M)) {
    const mesh = emptyMesh();
    for (const b of cell.buildings) extrudeRing(mesh, b.ring, b.heightM);
    const uri = `tile_${cell.key}.glb`;
    writeFileSync(`${outDir}/${uri}`, meshToGlb(mesh));
    tiles.push({ uri, box: boundingBox(cell.buildings) });
  }
  writeFileSync(`${outDir}/tileset.json`, JSON.stringify(buildTileset(origin, tiles)));
  console.log(`${placed.length} buildings in ${tiles.length} tiles -> ${outDir}/tileset.json`);
}

if (process.argv[1]?.endsWith("build-3dtiles.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
