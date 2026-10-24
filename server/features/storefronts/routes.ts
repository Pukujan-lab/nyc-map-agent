import { z } from "zod";
import { fail, json, parseQuery } from "../../../api/_lib/http";
import { octoConfigFromEnv, octoQuery } from "../../../api/_lib/octo";
import { cached, getJson } from "../../lib/ttlCache";
import { brandsQuery, licenseOk, logoFile, matchBrand, QID, snapBbox } from "./logic";

/**
 * Storefront brands and logos for the street-level sign bands.
 *  - /api/storefronts/brands?west&south&east&north: OpenStreetMap shops and
 *    amenities with brand:wikidata near the camera (Overpass, ODbL), cached
 *    24 h per ~500 m grid cell. Only what is nearby: the bbox is capped.
 *  - /api/storefronts/logo?qid=Q… (or ?name&lon&lat of a sign, matched to a
 *    brand POI of the same name within 60 m): the brand's Wikidata P154 logo as a 96 px
 *    Commons thumbnail, fetched once, re-hosted through Octo files (R2) and
 *    remembered in core.brand_logos; answers with that copy's bytes.
 *    Non-free or missing logos answer 404 and the sign shows its name only.
 */
// Public Overpass instances, tried in order (the main one sheds load with 429/502/504).
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const UA = { "user-agent": "nyc-map-agent (github.com/Pukujan/nyc-map-agent)" };
const DAY = 86_400_000;

export const BrandsBox = z
  .object({
    west: z.coerce.number().min(-74.3).max(-73.6),
    south: z.coerce.number().min(40.45).max(40.95),
    east: z.coerce.number().min(-74.3).max(-73.6),
    north: z.coerce.number().min(40.45).max(40.95),
  });
export const BrandsQuery = BrandsBox
  .refine((b) => b.east > b.west && b.north > b.south && b.east - b.west <= 0.02 && b.north - b.south <= 0.015, "bbox must be under ~1.5 km");
export const LogoQuery = z.object({
  qid: z.string().regex(QID).optional(),
  name: z.string().min(1).max(120).optional(),
  lon: z.coerce.number().min(-74.3).max(-73.6).optional(),
  lat: z.coerce.number().min(40.45).max(40.95).optional(),
});

export interface Brand { name: string; brand: string | null; qid: string; kind: string; lon: number; lat: number }

const Osm = z.object({
  elements: z.array(z.object({
    lat: z.number().optional(), lon: z.number().optional(),
    center: z.object({ lat: z.number(), lon: z.number() }).optional(),
    tags: z.record(z.string(), z.string()).optional(),
  })),
});

async function brands(b: z.infer<typeof BrandsQuery>): Promise<Brand[]> {
  let res: Response | null = null;
  for (const host of OVERPASS) {
    res = await fetch(host, { method: "POST", headers: { ...UA, "content-type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(brandsQuery(b))}`, signal: AbortSignal.timeout(25_000) }).catch(() => null);
    if (res?.ok) break;
  }
  if (!res?.ok) throw new Error(`overpass ${res?.status ?? "unreachable"}`);
  const out: Brand[] = [];
  for (const e of Osm.parse(await res.json()).elements) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    const qid = (t["brand:wikidata"] ?? "").split(";")[0].trim();
    if (lat === undefined || lon === undefined || !QID.test(qid)) continue;
    out.push({ name: t.name ?? t.brand ?? "", brand: t.brand ?? null, qid, kind: t.shop ?? t.amenity ?? "", lon, lat });
  }
  return out;
}

export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(BrandsQuery, request.url);
  if (q instanceof Response) return q;
  const box = snapBbox(q);
  try {
    const list = await cached(`brands:${box.west},${box.south},${box.east},${box.north}`, DAY, () => brands(box));
    return json({ brands: list, attribution: "© OpenStreetMap contributors (ODbL)" }, { maxAge: 86_400, browserMaxAge: 3600 });
  } catch (err) {
    return fail(err);
  }
}

const Info = z.object({
  query: z.object({
    pages: z.record(z.string(), z.object({
      imageinfo: z.array(z.object({
        thumburl: z.string().optional(),
        extmetadata: z.record(z.string(), z.object({ value: z.unknown() })).optional(),
      })).optional(),
    })),
  }),
});

const text = (v: unknown) => (typeof v === "string" ? v.replace(/<[^>]+>/g, "").trim().slice(0, 200) : null);

async function upload(name: string, bytes: Buffer, mimeType: string): Promise<string> {
  const { baseUrl, apiKey, workspaceId } = octoConfigFromEnv();
  const post = async (path: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(`octo files ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  };
  const up = await post("/api/files/upload", { workspaceId, name, mimeType, data: bytes.toString("base64"), dataEncoding: "base64" });
  const pub = await post(`/api/files/${String(up.id)}/publish?workspaceId=${workspaceId}`);
  return String(pub.url);
}

async function resolveLogo(qid: string): Promise<string | null> {
  const known = (await octoQuery<{ url: string | null }>("SELECT url FROM core.brand_logos WHERE qid = $1", [qid])).rows[0];
  if (known) return known.url;
  let url: string | null = null, file: string | null = null, license: string | null = null, artist: string | null = null;
  file = logoFile(await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, UA, 10_000), qid);
  if (file) {
    const info = Info.parse(await getJson(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "96" })}`, UA, 10_000));
    const ii = Object.values(info.query.pages)[0]?.imageinfo?.[0];
    license = text(ii?.extmetadata?.LicenseShortName?.value);
    artist = text(ii?.extmetadata?.Artist?.value);
    if (ii?.thumburl && licenseOk(license)) {
      const res = await fetch(ii.thumburl, { headers: UA, signal: AbortSignal.timeout(10_000) });
      if (res.ok) url = await upload(`brand-logo-${qid}.png`, Buffer.from(await res.arrayBuffer()), res.headers.get("content-type") ?? "image/png");
    }
  }
  await octoQuery(
    "INSERT INTO core.brand_logos (qid, url, file, license, artist) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (qid) DO NOTHING",
    [qid, url, file, license, artist],
  );
  return url;
}

/** The brand id for a sign: same name within 60 m among the cell's brand POIs. */
async function qidFor(name: string, lon: number, lat: number): Promise<string | null> {
  const box = snapBbox({ west: lon - 0.003, south: lat - 0.003, east: lon + 0.003, north: lat + 0.003 });
  const list = await cached(`brands:${box.west},${box.south},${box.east},${box.north}`, DAY, () => brands(box));
  return matchBrand({ name, lon, lat }, list);
}

export async function GET_LOGO(request: Request): Promise<Response> {
  const q = parseQuery(LogoQuery, request.url);
  if (q instanceof Response) return q;
  try {
    const qid = q.qid ?? (q.name && q.lon !== undefined && q.lat !== undefined ? await qidFor(q.name, q.lon, q.lat) : null);
    if (!qid) return json({ error: "no_brand" }, { status: 404 });
    const url = await cached(`logo:${qid}`, DAY, () => resolveLogo(qid));
    if (!url) return json({ error: "no_logo" }, { status: 404 });
    // Same-origin bytes (the copy lives in R2): the sign atlas is a WebGL
    // texture, and a cross-origin image would taint its canvas.
    const bytes = await cached(`logo-bytes:${qid}`, DAY, async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`logo copy ${res.status}`);
      return { type: res.headers.get("content-type") ?? "image/png", body: new Uint8Array(await res.arrayBuffer()) };
    });
    return new Response(bytes.body, { headers: { "content-type": bytes.type, "cache-control": "public, max-age=86400, s-maxage=604800, immutable" } });
  } catch (err) {
    return fail(err);
  }
}
