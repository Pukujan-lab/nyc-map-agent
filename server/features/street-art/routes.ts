import { z } from "zod";
import { fail, json, parseQuery } from "../../../api/_lib/http";
import { cached, getJson } from "../../lib/ttlCache";
import { licenseOk, snapBbox } from "../../lib/osm";
import { artQuery, commonsFile, wallSlab } from "./logic";

/**
 * /api/street-art?west&south&east&north: OSM murals and graffiti
 * (tourism=artwork, artwork_type mural|graffiti; ODbL) near the camera, each
 * snapped onto the nearest building wall as a thin slab polygon. `img` is a
 * 512 px Commons thumbnail only when the file's licence is free (PD, CC0,
 * CC BY, CC BY-SA); otherwise null and the client paints a placeholder.
 * Cached 24 h per ~500 m grid cell.
 */
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const UA = { "user-agent": "nyc-map-agent (github.com/Pukujan/nyc-map-agent)" };
const DAY = 86_400_000;

export const ArtBox = z.object({
  west: z.coerce.number().min(-74.3).max(-73.6),
  south: z.coerce.number().min(40.45).max(40.95),
  east: z.coerce.number().min(-74.3).max(-73.6),
  north: z.coerce.number().min(40.45).max(40.95),
});
const ArtQuery = ArtBox.refine((b) => b.east > b.west && b.north > b.south && b.east - b.west <= 0.02 && b.north - b.south <= 0.015, "bbox must be under ~1.5 km");

const Osm = z.object({
  elements: z.array(z.object({
    type: z.string(), id: z.number(),
    lat: z.number().optional(), lon: z.number().optional(),
    center: z.object({ lat: z.number(), lon: z.number() }).optional(),
    geometry: z.array(z.object({ lat: z.number(), lon: z.number() })).optional(),
    tags: z.record(z.string()).optional(),
  })),
});
const Info = z.object({ query: z.object({ pages: z.record(z.object({ imageinfo: z.array(z.object({ thumburl: z.string().optional(), extmetadata: z.record(z.object({ value: z.unknown() })).optional() })).optional() })) }) });
const text = (v: unknown) => (typeof v === "string" ? v.replace(/<[^>]+>/g, "").trim().slice(0, 120) : null);

async function commons(file: string): Promise<{ img: string | null; license: string | null; credit: string | null }> {
  const info = Info.parse(await getJson(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "512" })}`, UA, 10_000));
  const ii = Object.values(info.query.pages)[0]?.imageinfo?.[0];
  const license = text(ii?.extmetadata?.LicenseShortName?.value);
  return { img: ii?.thumburl && licenseOk(license) ? ii.thumburl : null, license, credit: text(ii?.extmetadata?.Artist?.value) };
}

async function art(b: z.infer<typeof ArtBox>) {
  let res: Response | null = null;
  for (const host of OVERPASS) {
    res = await fetch(host, { method: "POST", headers: { ...UA, "content-type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(artQuery(b))}`, signal: AbortSignal.timeout(25_000) }).catch(() => null);
    if (res?.ok) break;
  }
  if (!res?.ok) throw new Error(`overpass ${res?.status ?? "unreachable"}`);
  const els = Osm.parse(await res.json()).elements;
  const walls = els.filter((e) => e.type === "way" && e.geometry && e.tags?.building).map((e) => e.geometry!.map((g) => [g.lon, g.lat] as [number, number]));
  const features = [];
  for (const e of els) {
    const t = e.tags ?? {};
    if (t.tourism !== "artwork") continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat === undefined || lon === undefined) continue;
    const ring = wallSlab([lon, lat], walls);
    if (!ring) continue;
    const file = commonsFile(t);
    const c = file ? await cached(`art-file:${file}`, DAY, () => commons(file)).catch(() => ({ img: null, license: null, credit: null })) : { img: null, license: null, credit: null };
    features.push({
      type: "Feature" as const,
      id: e.id,
      geometry: { type: "Polygon" as const, coordinates: [ring] },
      properties: { id: `${e.type}/${e.id}`, name: t.name ?? null, artist: t.artist_name ?? c.credit, kind: t.artwork_type, img: c.img, license: c.img ? c.license : null },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(ArtQuery, request.url);
  if (q instanceof Response) return q;
  const box = snapBbox(q);
  try {
    const fc = await cached(`art:${box.west},${box.south},${box.east},${box.north}`, DAY, () => art(box));
    return json({ ...fc, attribution: "© OpenStreetMap contributors (ODbL); images from Wikimedia Commons under their stated licences" }, { maxAge: 86_400, browserMaxAge: 3600 });
  } catch (err) {
    return fail(err);
  }
}
