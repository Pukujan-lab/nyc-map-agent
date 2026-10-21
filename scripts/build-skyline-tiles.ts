/**
 * Bakes a low-zoom `skyline` layer into the city tiles so tall towers show up
 * from across the river (DUMBO, Long Island City) long before the z14+ textured
 * city loads. The main build starts at z14 (`-Z14`), so a pitched view whose
 * horizon falls back to z11-13 tiles had no buildings there at all.
 *
 *   Tiles z11-16: a pitched camera below z14 still loads z14-16 tiles near the eye.
 *   tall   height > 60 m from z12, height > 120 m from z11 (Building Footprints 5zhs-2jue)
 *
 * Tiny-polygon reduction is off: tippecanoe would otherwise turn slender towers
 * into specks or drop them at z11-12, which is exactly what reads as "weird"
 * from a distance. Geometry is simplified instead, and only `h` and `facade`
 * are kept, so the layer stays small (a few MB).
 *
 *   pnpm build:city-tiles && pnpm build:skyline-tiles && pnpm publish:city-tiles
 * Needs tippecanoe/tile-join on PATH.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { NYC_BBOX } from "./build-city-tiles";

const CITY = process.env.CITY_TILES_FILE ?? "public/tiles/nyc-city.pmtiles";
const WORK = "/tmp/nyc-skyline";
const FT = 0.3048;
/** Towers above this height (m) are in the skyline layer. */
export const SKYLINE_MIN_M = 60;
/** Towers above this height (m) already show at z11. */
export const SKYLINE_Z11_M = 120;

export type SkylineFacade = "glass" | "limestone" | "tower";

/** Same rule of thumb as classify() for tall buildings, from the footprint row alone. */
export function skylineFacade(heightM: number, year?: number): SkylineFacade {
  const y = year || 1960;
  if (heightM > 100 && y >= 1960) return "glass";
  if (y < 1950) return "limestone";
  return "tower";
}

export function skylineMinZoom(heightM: number): number {
  return heightM > SKYLINE_Z11_M ? 11 : 12;
}

async function tallFootprints(): Promise<Array<Record<string, unknown>>> {
  const b = NYC_BBOX;
  const q = new URLSearchParams({
    $select: "the_geom,height_roof,construction_year",
    $where: `height_roof > ${(SKYLINE_MIN_M / FT).toFixed(1)} and within_box(the_geom, ${b.north}, ${b.west}, ${b.south}, ${b.east})`,
    $limit: "50000",
  });
  const headers: Record<string, string> = {};
  const { SOCRATA_KEY_ID: id, SOCRATA_KEY_SECRET: secret } = process.env;
  if (id && secret) headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const res = await fetch(`https://data.cityofnewyork.us/resource/5zhs-2jue.json?${q}`, { headers });
  if (!res.ok) throw new Error(`5zhs-2jue ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Array<Record<string, unknown>>;
}

function run(cmd: string, args: string[]) {
  execFileSync(cmd, args, { stdio: "inherit", env: { TIPPECANOE_MAX_THREADS: "2", ...process.env } });
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  const rows = await tallFootprints();
  const lines: string[] = [];
  for (const r of rows) {
    const h = Number(r.height_roof) * FT;
    if (!(h > SKYLINE_MIN_M) || !r.the_geom) continue;
    lines.push(JSON.stringify({
      type: "Feature",
      tippecanoe: { layer: "skyline", minzoom: skylineMinZoom(h) },
      properties: { h: Math.round(h), facade: skylineFacade(h, Number(r.construction_year) || undefined) },
      geometry: r.the_geom,
    }));
  }
  const seq = `${WORK}/skyline.geojsonseq`;
  writeFileSync(seq, lines.join("\n") + "\n");
  const sky = `${WORK}/skyline.pmtiles`;
  run("tippecanoe", ["-q", "-o", sky, "--force", "-Z11", "-z16", "--read-parallel",
    "--no-tiny-polygon-reduction", "--no-feature-limit", "--simplification=4",
    "--detect-shared-borders", seq]);
  const merged = `${CITY}.tmp.pmtiles`;
  run("tile-join", ["-q", "-o", merged, "--force", "--no-tile-size-limit", "-x", "skyline", CITY]);
  run("tile-join", ["-q", "-o", `${merged}2.pmtiles`, "--force", "--no-tile-size-limit", merged, sky]);
  renameSync(`${merged}2.pmtiles`, CITY);
  execFileSync("rm", ["-f", merged]);
  console.log(JSON.stringify({ towers: lines.length, skylineBytes: statSync(sky).size, cityBytes: statSync(CITY).size }));
}

if (process.argv[1]?.endsWith("build-skyline-tiles.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
