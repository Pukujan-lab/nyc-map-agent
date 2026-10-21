/**
 * Bakes corner street-name signs into the city tiles as a `signs` point layer
 * (properties a, b = the two street names; ba, bb = their bearings in degrees).
 * Intersections come from DCP LION via DuckDB spatial (scripts/street-signs.sql);
 * tippecanoe packs them and tile-join merges them into public/tiles/nyc-city.pmtiles.
 *
 *   pnpm build:city-tiles && pnpm build:sign-tiles && pnpm publish:city-tiles
 * Needs duckdb (with the spatial extension) and tippecanoe/tile-join on PATH.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const LION_URL = process.env.LION_URL ?? "https://s-media.nyc.gov/agencies/dcp/assets/files/zip/data-tools/bytes/lion/nyclion_25c.zip";
const WORK = "/tmp/nyc-lion";
const CITY = process.env.CITY_TILES_FILE ?? "public/tiles/nyc-city.pmtiles";

function run(cmd: string, args: string[], env: Record<string, string> = {}) {
  execFileSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  const gdb = `${WORK}/lion/lion.gdb`;
  if (!existsSync(gdb)) {
    const res = await fetch(LION_URL);
    if (!res.ok) throw new Error(`LION ${res.status}`);
    writeFileSync(`${WORK}/lion.zip`, Buffer.from(await res.arrayBuffer()));
    run("unzip", ["-o", "-q", `${WORK}/lion.zip`, "-d", WORK]);
  }
  const seq = `${WORK}/signs.geojsonl`;
  const sql = readFileSync("scripts/street-signs.sql", "utf8").replace("OUT_PLACEHOLDER", seq);
  writeFileSync(`${WORK}/signs.sql`, sql);
  execFileSync("rm", ["-f", seq]);
  run("duckdb", ["-c", `.read ${WORK}/signs.sql`], { LION_GDB: gdb });
  const signs = `${WORK}/signs.pmtiles`;
  run("tippecanoe", ["-q", "-o", signs, "--force", "-l", "signs", "-Z16", "-z16", "-r1",
    "--no-feature-limit", "--no-tile-size-limit", seq]);
  const merged = `${CITY}.tmp.pmtiles`;
  run("tile-join", ["-q", "-o", merged, "--force", "--no-tile-size-limit", "-x", "signs", CITY]);
  run("tile-join", ["-q", "-o", `${merged}2.pmtiles`, "--force", "--no-tile-size-limit", merged, signs]);
  renameSync(`${merged}2.pmtiles`, CITY);
  execFileSync("rm", ["-f", merged]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
