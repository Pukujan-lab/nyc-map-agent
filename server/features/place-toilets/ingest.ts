import { fromOsm } from "./normalize";
import { OverpassResponse, type StoredPlaceToilet } from "./schema";

/**
 * Nightly refresh of core.place_toilets (called from scripts/ingest.ts):
 * one Overpass query for NYC (wikidata Q60), normalised and replaced whole.
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */
export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const OVERPASS_QUERY = `[out:json][timeout:180];
area["wikidata"="Q60"]->.nyc;
(
  nwr["toilets"="yes"]["amenity"~"^(restaurant|cafe|fast_food|bar|pub)$"](area.nyc);
  nwr["toilets"="yes"]["shop"](area.nyc);
);
out center tags;`;

type PostForm = (url: string, body: URLSearchParams) => Promise<unknown>;
type Query = (sql: string, params?: unknown[]) => Promise<unknown>;

export async function collectPlaceToilets(post: PostForm): Promise<{ places: StoredPlaceToilet[]; elements: number }> {
  const { elements } = OverpassResponse.parse(await post(OVERPASS_URL, new URLSearchParams({ data: OVERPASS_QUERY })));
  const byId = new Map<string, StoredPlaceToilet>();
  for (const e of elements) {
    const p = fromOsm(e);
    if (p) byId.set(p.id, p);
  }
  return { places: [...byId.values()], elements: elements.length };
}

/** Replaces the table in one statement pair; refuses an empty result so a bad Overpass day keeps yesterday's data. */
export async function replacePlaceToilets(places: StoredPlaceToilet[], query: Query): Promise<void> {
  if (!places.length) throw new Error("overpass returned no places; keeping the previous table");
  await query("DELETE FROM core.place_toilets");
  for (let i = 0; i < places.length; i += 2000) {
    await query(
      `INSERT INTO core.place_toilets (id, name, kind, access, access_tagged, wheelchair, changing_table, fee, lon, lat, source, url, refreshed_at)
       SELECT id, name, kind, access, "accessTagged", wheelchair, "changingTable", fee, lon, lat, source, url, now()
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, kind text, access text, "accessTagged" boolean, wheelchair boolean,
         "changingTable" boolean, fee boolean, lon float8, lat float8, source text, url text)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(places.slice(i, i + 2000))],
    );
  }
}
