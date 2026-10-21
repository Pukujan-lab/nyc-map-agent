/**
 * Builds public/transit/entrance-signs.json: what each subway street entrance's sign says.
 * Source: MTA Subway Entrances and Exits (data.ny.gov i9wp-a4ja), which lists every entrance
 * with its GTFS stop, its station (constituent_station_name) and the daytime routes of the whole
 * station complex (so a Times Sq entrance shows 1 2 3 7 A C E N Q R W S).
 * Keyed by GTFS stop id (the `id` on subway.json entrances), plus per-entrance exceptions
 * (exit-only) keyed by rounded "lon,lat". The data has no uptown/downtown-only flag.
 * Published through Octo/R2 (pnpm publish:entrance-signs) and served at /api/entrance-signs.
 *
 *   pnpm build:entrance-signs && pnpm publish:entrance-signs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnv } from "./env";
import { signsFromRows, type EntranceRow } from "../src/lib/transit/entranceSigns";

async function main() {
  loadEnv();
  const headers: Record<string, string> = {};
  const { SOCRATA_KEY_ID: id, SOCRATA_KEY_SECRET: secret } = process.env;
  if (id && secret) headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const q = new URLSearchParams({
    $limit: "5000",
    $select: "gtfs_stop_id,stop_name,constituent_station_name,daytime_routes,entrance_type,entry_allowed,exit_allowed,entrance_latitude,entrance_longitude",
  });
  const res = await fetch(`https://data.ny.gov/resource/i9wp-a4ja.json?${q}`, { headers });
  if (!res.ok) throw new Error(`i9wp-a4ja ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as EntranceRow[];
  const out = signsFromRows(rows);
  mkdirSync("public/transit", { recursive: true });
  const file = "public/transit/entrance-signs.json";
  writeFileSync(file, JSON.stringify({ source: "data.ny.gov/i9wp-a4ja", builtAt: new Date().toISOString(), ...out }));
  console.log(`${file}: ${rows.length} entrances, ${Object.keys(out.stations).length} stops, ${Object.keys(out.exitOnly).length} exit-only`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
