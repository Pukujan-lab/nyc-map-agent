/**
 * Guide landmarks for all five boroughs (#361 goal 3), from Wikidata (CC0):
 * items with coordinates inside the NYC box, enough Wikipedia sitelinks to be
 * well known, a borough reached through "located in" (P131), and a
 * street-visible kind (see scripts/landmark-guide-normalize.ts). Pictures are
 * the item's P18 Commons file, kept only when Commons states a free licence,
 * with the author and licence stored next to it.
 *
 *   pnpm exec tsx scripts/build-landmark-guide.ts   -> src/lib/guide/landmarks.json
 */
import { writeFileSync } from "node:fs";
import type { GuideLandmarkFile } from "../src/lib/guide/landmarkTypes";
import { BOROUGH_QIDS, INCLUDE, classify, commonsFile, normalize, pictureFromMeta, qid, resolveBoroughs, type PlaceHint, type WdRow } from "./landmark-guide-normalize";

const UA = "nyc-map-agent-landmarks/1.0 (https://github.com/Pukujan-lab/nyc-map-agent)";
const SPARQL = "https://query.wikidata.org/sparql";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const OUT = "src/lib/guide/landmarks.json";

type Binding = Record<string, { value: string } | undefined>;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sparql(query: string, attempt = 0): Promise<Binding[]> {
  const res = await fetch(SPARQL, {
    method: "POST",
    body: new URLSearchParams({ query }),
    headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
  });
  // The query service rate-limits bursts; honour Retry-After a few times.
  if (res.status === 429 && attempt < 4) {
    await pause((Number(res.headers.get("retry-after")) || 10) * 1000);
    return sparql(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`Wikidata ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings;
}

// The box service is fast; a P131+ walk over all of Wikidata times out.
const CANDIDATES = `SELECT ?item ?label ?coord ?sl (GROUP_CONCAT(DISTINCT ?clsLabel; separator="|") AS ?classes) (SAMPLE(?img) AS ?image) WHERE {
  SERVICE wikibase:box { ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(-74.26 40.49)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(-73.69 40.92)"^^geo:wktLiteral . }
  ?item wikibase:sitelinks ?sl . FILTER(?sl >= 5)
  ?item wdt:P31 ?cls . ?cls rdfs:label ?clsLabel . FILTER(LANG(?clsLabel) = "en")
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item wdt:P18 ?img }
  FILTER NOT EXISTS { ?item wdt:P576 ?gone }
} GROUP BY ?item ?label ?coord ?sl`;

/** The hand-picked INCLUDE items, fetched by ID whatever their sitelinks. */
const INCLUDED = `SELECT ?item ?label ?coord ?sl (GROUP_CONCAT(DISTINCT ?clsLabel; separator="|") AS ?classes) (SAMPLE(?img) AS ?image) WHERE {
  VALUES ?item { ${Object.keys(INCLUDE).map((i) => `wd:${i}`).join(" ")} }
  ?item wdt:P625 ?coord ; wikibase:sitelinks ?sl ; rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item wdt:P31 ?cls . ?cls rdfs:label ?clsLabel . FILTER(LANG(?clsLabel) = "en") }
  OPTIONAL { ?item wdt:P18 ?img }
} GROUP BY ?item ?label ?coord ?sl`;

/** Boroughs and New York City (Q60) on each item's "located in" chain; ?direct marks a first-step match. */
const boroughQuery = (ids: string[]) => `SELECT ?item ?b ?direct WHERE {
  VALUES ?item { ${ids.map((i) => `wd:${i}`).join(" ")} }
  VALUES ?b { wd:Q60 ${Object.keys(BOROUGH_QIDS).map((i) => `wd:${i}`).join(" ")} }
  ?item wdt:P131+ ?b .
  BIND(EXISTS { ?item wdt:P131 ?b } AS ?direct)
}`;

async function boroughsFor(ids: string[]): Promise<Map<string, PlaceHint>> {
  const out = new Map<string, PlaceHint>();
  for (let i = 0; i < ids.length; i += 150) {
    if (i) await pause(1500);
    for (const b of await sparql(boroughQuery(ids.slice(i, i + 150)))) {
      const id = qid(b.item!.value);
      const hint = out.get(id) ?? { inNyc: false };
      hint.inNyc = true;
      const borough = BOROUGH_QIDS[qid(b.b!.value)];
      // A bridge sits in two boroughs; the direct "located in" wins, else the first seen.
      if (borough && (!hint.borough || b.direct?.value === "true")) hint.borough = borough;
      out.set(id, hint);
    }
  }
  return out;
}

async function commonsMeta(files: string[]): Promise<Map<string, Record<string, { value?: string }>>> {
  const out = new Map<string, Record<string, { value?: string }>>();
  for (let i = 0; i < files.length; i += 40) {
    const titles = files.slice(i, i + 40).map((f) => `File:${f}`).join("|");
    const url = `${COMMONS}?action=query&format=json&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=LicenseShortName|Artist|LicenseUrl&titles=${encodeURIComponent(titles)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Commons ${res.status}`);
    const body = (await res.json()) as {
      query?: { normalized?: Array<{ from: string; to: string }>; pages?: Record<string, { title: string; imageinfo?: Array<{ extmetadata?: Record<string, { value?: string }> }> }> };
    };
    for (const p of Object.values(body.query?.pages ?? {})) {
      const meta = p.imageinfo?.[0]?.extmetadata;
      if (meta) out.set(p.title.replace(/^File:/, ""), meta);
    }
  }
  return out;
}

const rows: WdRow[] = [...(await sparql(CANDIDATES)), ...(await sparql(INCLUDED))].map((b) => ({
  item: b.item!.value,
  label: b.label!.value,
  coord: b.coord!.value,
  sitelinks: Number(b.sl!.value),
  classes: (b.classes?.value ?? "").split("|").filter(Boolean),
  ...(b.image ? { image: commonsFile(b.image.value) } : {}),
}));
console.log(rows.length, "candidates in the NYC box");
// Only rows of a street-visible kind need the (slower) borough lookup.
const boroughs = await boroughsFor([...new Set(rows.filter((r) => classify(r.classes)).map((r) => qid(r.item)))]);
const landmarks = normalize(rows, resolveBoroughs(rows, boroughs));
const imageOf = new Map(rows.filter((r) => r.image).map((r) => [qid(r.item), r.image!]));
const meta = await commonsMeta([...new Set(landmarks.flatMap((l) => (imageOf.has(l.id) ? [imageOf.get(l.id)!] : [])))]);
let pictures = 0;
for (const l of landmarks) {
  const file = imageOf.get(l.id);
  const m = file ? meta.get(file) : undefined;
  const pic = file && m ? pictureFromMeta(file, m) : null;
  if (pic) {
    l.picture = pic;
    pictures++;
  }
}
const file: GuideLandmarkFile = {
  source: "Wikidata (query.wikidata.org), generated by scripts/build-landmark-guide.ts",
  license: "Wikidata data: CC0 1.0",
  pictures: "Wikimedia Commons; each picture carries its own licence and author",
  generated: new Date().toISOString().slice(0, 10),
  landmarks,
};
writeFileSync(OUT, `${JSON.stringify(file, null, 0).replace(/\},\{"id"/g, '},\n{"id"')}\n`);
const per = Object.values(BOROUGH_QIDS).map((b) => `${b} ${landmarks.filter((l) => l.borough === b).length}`);
console.log(landmarks.length, "landmarks,", pictures, "with pictures:", per.join(", "));
