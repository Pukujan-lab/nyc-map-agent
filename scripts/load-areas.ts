/**
 * Loads NTA 2020 and community-district boundaries into Octo core.area_shapes,
 * simplified with mapshaper (Visvalingam, keep-shapes) so the browser gets a
 * small file from /api/areas instead of the full-resolution Socrata GeoJSON.
 *
 *   pnpm load:areas            (needs OCTO_* in .env / OCTO_ENV_FILE)
 */
import mapshaper from "mapshaper";
import { octoQuery } from "../api/_lib/octo";
import { loadEnv } from "./env";

const SOCRATA = "https://data.cityofnewyork.us/resource";
/** Percentage of removable vertices kept. 8% keeps block-scale outlines recognisable. */
const KEEP = process.env.AREA_SIMPLIFY ?? "8%";

const LEVELS = [
  { level: "nta", dataset: "9nt8-h7nd", limit: 400, code: "nta2020", name: "ntaname", borough: "boroname" },
  { level: "cd", dataset: "5crt-au7u", limit: 100, code: "boro_cd", name: "", borough: "" },
] as const;

const BOROUGH_BY_DIGIT: Record<string, string> = {
  "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
};

interface Feature {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
}

async function simplify(geojson: string): Promise<{ features: Feature[] }> {
  const out = await mapshaper.applyCommands(
    `-i in.json -simplify visvalingam ${KEEP} keep-shapes -o out.json precision=0.00001 format=geojson`,
    { "in.json": geojson },
  );
  return JSON.parse(String(out["out.json"]));
}

async function main() {
  loadEnv();
  const headers: Record<string, string> = {};
  const { SOCRATA_KEY_ID: id, SOCRATA_KEY_SECRET: secret } = process.env;
  if (id && secret) headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  for (const spec of LEVELS) {
    const res = await fetch(`${SOCRATA}/${spec.dataset}.geojson?$limit=${spec.limit}`, { headers });
    if (!res.ok) throw new Error(`${spec.dataset} ${res.status}`);
    const raw = await res.text();
    const { features } = await simplify(raw);
    let n = 0;
    for (const f of features) {
      if (!f.geometry) continue;
      const code = String(f.properties[spec.code] ?? "");
      if (!code) continue;
      const borough = spec.borough ? String(f.properties[spec.borough] ?? "") : BOROUGH_BY_DIGIT[code.charAt(0)] ?? "";
      const name = spec.name ? String(f.properties[spec.name] ?? code) : `${borough} CD ${Number(code.slice(1))}`;
      await octoQuery(
        `INSERT INTO core.area_shapes (level, area, name, borough, geometry, source_dataset, loaded_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())
         ON CONFLICT (level, area) DO UPDATE SET name = excluded.name, borough = excluded.borough,
           geometry = excluded.geometry, source_dataset = excluded.source_dataset, loaded_at = now()`,
        [spec.level, code, name, borough, JSON.stringify(f.geometry), spec.dataset],
      );
      n++;
    }
    console.log(`${spec.level}: ${n} shapes (raw ${(raw.length / 1e6).toFixed(1)} MB)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
