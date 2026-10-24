import { z } from "@hono/zod-openapi";

/**
 * Second restroom source: OpenStreetMap public toilets (amenity=toilets in
 * NYC), refreshed nightly into core.osm_toilets (called from scripts/ingest.ts).
 * The city list (Socrata i7jb-7jku) was last updated in June 2025; OSM fills in
 * closures and new places. Customers-only toilets stay with place-toilets.
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */
export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
/** `meta` adds each element's last-edit timestamp (the record's asOf); editor names are dropped. */
export const OVERPASS_QUERY = `[out:json][timeout:180];
area["wikidata"="Q60"]->.nyc;
nwr["amenity"="toilets"](area.nyc);
out center meta;`;

const OverpassElement = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  timestamp: z.string().optional(),
  tags: z.record(z.string(), z.string()).default({}),
});
type OverpassElement = z.infer<typeof OverpassElement>;
const OverpassResponse = z.object({ elements: z.array(OverpassElement) });

/** One OSM toilet as stored in core.osm_toilets. */
export interface OsmToilet {
  id: string;
  name: string | null;
  /** Raw access tag, null when untagged (a public amenity=toilets reads as open). */
  access: string | null;
  fee: boolean | null;
  /** OSM wheelchair value: yes, limited, no, designated. */
  wheelchair: string | null;
  openingHours: string | null;
  changingTable: boolean | null;
  unisex: boolean | null;
  operator: string | null;
  url: string;
  /** When the element was last edited in OSM (ISO). */
  editedAt: string | null;
  lon: number;
  lat: number;
}

/** Access values kept. private, no and customers (and anything else) are dropped. */
const OPEN_ACCESS = new Set(["yes", "public", "permissive", "designated", "destination"]);

const yesNo = (v: string | undefined): boolean | null => (v === "yes" || v === "designated" ? true : v === "no" ? false : null);

/** One Overpass element → a stored toilet, or null when it is not amenity=toilets, not open to the public, or has no position. */
export function fromOsmToilet(e: OverpassElement): OsmToilet | null {
  const t = e.tags;
  if (t.amenity !== "toilets") return null;
  const access = t.access ?? null;
  if (access !== null && !OPEN_ACCESS.has(access)) return null;
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const unisex = t.unisex !== undefined ? yesNo(t.unisex) : t.gender_segregated === "no" ? true : t.gender_segregated === "yes" ? false : null;
  return {
    id: `osm:${e.type}/${e.id}`,
    name: t.name ?? null,
    access,
    fee: yesNo(t.fee),
    wheelchair: t.wheelchair ?? null,
    openingHours: t.opening_hours ?? null,
    changingTable: yesNo(t.changing_table),
    unisex,
    operator: t.operator ?? null,
    url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    editedAt: e.timestamp ?? null,
    lon,
    lat,
  };
}

type PostForm = (url: string, body: URLSearchParams) => Promise<unknown>;
type Query = (sql: string, params?: unknown[]) => Promise<unknown>;

export async function collectOsmToilets(post: PostForm): Promise<{ toilets: OsmToilet[]; elements: number }> {
  const { elements } = OverpassResponse.parse(await post(OVERPASS_URL, new URLSearchParams({ data: OVERPASS_QUERY })));
  const byId = new Map<string, OsmToilet>();
  for (const e of elements) {
    const p = fromOsmToilet(e);
    if (p) byId.set(p.id, p);
  }
  return { toilets: [...byId.values()], elements: elements.length };
}

/** Replaces the table whole; refuses an empty result so a bad Overpass day keeps yesterday's data. */
export async function replaceOsmToilets(toilets: OsmToilet[], query: Query): Promise<void> {
  if (!toilets.length) throw new Error("overpass returned no toilets; keeping the previous table");
  await query("DELETE FROM core.osm_toilets");
  for (let i = 0; i < toilets.length; i += 2000) {
    await query(
      `INSERT INTO core.osm_toilets (id, name, access, fee, wheelchair, opening_hours, changing_table, unisex, operator, url, edited_at, lon, lat, refreshed_at)
       SELECT id, name, access, fee, wheelchair, "openingHours", "changingTable", unisex, operator, url, "editedAt", lon, lat, now()
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, access text, fee boolean, wheelchair text, "openingHours" text,
         "changingTable" boolean, unisex boolean, operator text, url text, "editedAt" timestamptz, lon float8, lat float8)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(toilets.slice(i, i + 2000))],
    );
  }
}
