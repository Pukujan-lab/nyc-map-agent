/**
 * Pure normalization for scripts/build-landmark-guide.ts: Wikidata rows in,
 * the compact guide landmark list out. Kept apart from the fetch so tests run
 * without the network.
 */
import type { GuideBorough, GuideCategory, GuideLandmark, GuidePicture } from "../src/lib/guide/landmarkTypes";

export interface WdRow {
  /** Entity URI, e.g. http://www.wikidata.org/entity/Q9188. */
  item: string;
  label: string;
  /** WKT "Point(lon lat)". */
  coord: string;
  sitelinks: number;
  /** English labels of the item's instance-of classes. */
  classes: string[];
  /** Commons file name from P18, if any. */
  image?: string;
}

export const BOROUGH_QIDS: Record<string, GuideBorough> = {
  Q11299: "Manhattan",
  Q18419: "Brooklyn",
  Q18424: "Queens",
  Q18426: "Bronx",
  Q18432: "Staten Island",
};

/**
 * Class label -> short category, first match wins. Only kinds you can see from
 * the street: neighbourhoods, streets, schools and organisations never match.
 */
const CATEGORY_RULES: Array<[GuideCategory, RegExp]> = [
  ["bridge", /\bbridge\b/],
  ["station", /railway station|metro station|underground station|union station|station building|bus terminal|ferry terminal|airport terminal|aerodrome|\bairport\b/],
  ["monument", /statue|monument|memorial|sculpture|fountain|triumphal arch|obelisk|rostral column|\bglobe\b|\bfolly\b|\bgrave\b/],
  ["tower", /skyscraper|supertall|\btower\b|tower block|high-rise|office building/],
  ["venue", /stadium|arena|\bvenue\b|concert hall|theatre building|performing arts (building|center)|opera house/],
  ["museum", /museum/],
  ["store", /department store|shopping (center|centre|mall)|market hall/],
  ["square", /\bsquare\b|\bplaza\b|traffic circle/],
  ["park", /\bpark\b|botanical garden|\bzoo\b|\bbeach\b|cemetery/],
  ["worship", /church|cathedral|basilica|synagogue|mosque/],
  ["civic", /city hall|rathaus|courthouse|public library|library building|official residence|national memorial/],
];

/** Gone, planned or not a place: dropped even when a category matches. */
const REJECT = /destroyed|demolished|proposed|former |planned|event|exhibit|artwork|watercraft|\bship\b|route\b|\bfire\b|disaster|diocese|library (network|system)/;

/** Only big stations: every subway stop has ~10 Wikipedia editions. Terminals and airports use the borough floor. */
const STATION_MIN_SITELINKS = 16;
const TERMINAL = /ferry terminal|bus terminal|airport|aerodrome/;

/**
 * Kept whatever the sitelink floors say, with the borough set by hand: the
 * Wikidata point decides where you see it from, not every borough the item
 * touches. Both bridge points sit on the Astoria shore.
 */
export const INCLUDE: Record<string, { borough: GuideBorough; category: GuideCategory; tier: GuideLandmark["tier"]; name?: string }> = {
  Q1035131: { borough: "Queens", category: "bridge", tier: 2 }, // Hell Gate Bridge
  Q125450: { borough: "Queens", category: "bridge", tier: 2, name: "Robert F. Kennedy (Triborough) Bridge" },
  // Wikidata's only item for the St. George ferry, rail and bus terminal.
  Q5927015: { borough: "Staten Island", category: "station", tier: 2, name: "St. George Ferry Terminal" },
};

/** Fewer, bigger names in Manhattan; the other boroughs have fewer articles per place. */
export const MIN_SITELINKS: Record<GuideBorough, number> = {
  Manhattan: 20,
  Brooklyn: 8,
  Queens: 8,
  Bronx: 7,
  "Staten Island": 5,
};

/** Sitelinks for the citywide (tier 1) and mid-zoom (tier 2) sets. */
const TIER1 = 50;
const TIER2 = 28;
/** Each borough's top names show citywide, so the overview is never Midtown only. */
const TIER1_PER_BOROUGH = 2;
/** A weaker landmark of the same kind this close to a stronger one adds no orientation. */
const MIN_SPACING_M = 120;
/** Different kinds may sit closer (Penn Station under Madison Square Garden), not on top. */
const MIN_SPACING_ANY_M = 40;

const LICENSE_OK = /^(cc0|cc[ -]by(-sa)?( |-)?[\d.]*|public domain|pd\b|pd-)/i;

export function classify(classes: string[]): GuideCategory | null {
  const joined = classes.map((c) => c.toLowerCase());
  if (joined.some((c) => REJECT.test(c))) return null;
  for (const [cat, re] of CATEGORY_RULES) if (joined.some((c) => re.test(c))) return cat;
  return null;
}

export function parsePoint(wkt: string): [number, number] | null {
  const m = /^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i.exec(wkt.trim());
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [round5(lon), round5(lat)] : null;
}

export function qid(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

/** "http://commons.wikimedia.org/wiki/Special:FilePath/Foo%20bar.jpg" -> "Foo bar.jpg". */
export function commonsFile(p18: string): string {
  const tail = p18.slice(p18.lastIndexOf("/") + 1);
  return decodeURIComponent(tail).replace(/_/g, " ");
}

/** Commons extmetadata -> stored picture, or null when the licence is unknown or not free. */
export function pictureFromMeta(file: string, meta: Record<string, { value?: string } | undefined>): GuidePicture | null {
  const license = stripHtml(meta.LicenseShortName?.value ?? "");
  if (!license || !LICENSE_OK.test(license)) return null;
  const artist = stripHtml(meta.Artist?.value ?? "").slice(0, 80) || "Unknown author";
  const url = meta.LicenseUrl?.value;
  const path = encodeURIComponent(file.replace(/ /g, "_"));
  return {
    file,
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${path}?width=320`,
    page: `https://commons.wikimedia.org/wiki/File:${path}`,
    license,
    artist,
    ...(url ? { licenseUrl: url } : {}),
  };
}

export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

function metres(a: [number, number], b: [number, number]): number {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111_320);
}

/** Where Wikidata's "located in" (P131) chain leads for one item. */
export interface PlaceHint {
  /** Borough reached through P131 (the direct one when there are several). */
  borough?: GuideBorough;
  /** The chain reaches New York City (Q60), even with no borough on the way. */
  inNyc: boolean;
}

/**
 * Items located in "New York City" with no borough (the Statue of Liberty)
 * take the borough of the nearest row that has one.
 */
export function resolveBoroughs(rows: WdRow[], hints: Map<string, PlaceHint>): Map<string, GuideBorough> {
  const out = new Map<string, GuideBorough>();
  const known: Array<{ at: [number, number]; borough: GuideBorough }> = [];
  for (const r of rows) {
    const b = hints.get(qid(r.item))?.borough;
    const at = parsePoint(r.coord);
    if (b) out.set(qid(r.item), b);
    if (b && at) known.push({ at, borough: b });
  }
  for (const r of rows) {
    const id = qid(r.item);
    const at = parsePoint(r.coord);
    if (out.has(id) || !hints.get(id)?.inNyc || !at || !known.length) continue;
    let best = known[0];
    for (const k of known) if (metres(k.at, at) < metres(best.at, at)) best = k;
    out.set(id, best.borough);
  }
  return out;
}

/**
 * Rows + borough per QID -> guide landmarks, strongest first.
 * Drops rows without a borough (New Jersey, Westchester), without a
 * street-visible category, under the borough's sitelink floor (higher for
 * stations), duplicated by name, or crowded by a stronger landmark.
 */
export function normalize(rows: WdRow[], boroughs: Map<string, GuideBorough>): GuideLandmark[] {
  const sorted = [...rows].sort((a, b) => b.sitelinks - a.sitelinks || a.label.localeCompare(b.label));
  const out: GuideLandmark[] = [];
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const r of sorted) {
    const id = qid(r.item);
    const inc = INCLUDE[id];
    const at = parsePoint(r.coord);
    if (!inc || !at || ids.has(id)) continue;
    const name = inc.name ?? r.label.trim();
    names.add(name.toLowerCase());
    ids.add(id);
    out.push({ id, name, category: inc.category, borough: inc.borough, lon: at[0], lat: at[1], tier: inc.tier, sitelinks: r.sitelinks });
  }
  for (const r of sorted) {
    const id = qid(r.item);
    if (ids.has(id)) continue;
    const borough = boroughs.get(id);
    if (!borough || r.sitelinks < MIN_SITELINKS[borough]) continue;
    const category = classify(r.classes);
    const at = parsePoint(r.coord);
    const name = r.label.trim();
    if (!category || !at || !name || /^Q\d+$/.test(name)) continue;
    if (category === "station" && r.sitelinks < STATION_MIN_SITELINKS && !r.classes.some((c) => TERMINAL.test(c.toLowerCase()))) continue;
    const key = name.toLowerCase();
    if (names.has(key)) continue;
    const crowded = out.some((o) => {
      const d = metres([o.lon, o.lat], at);
      return d < MIN_SPACING_ANY_M || (o.category === category && d < MIN_SPACING_M);
    });
    if (crowded) continue;
    names.add(key);
    ids.add(id);
    out.push({ id, name, category, borough, lon: at[0], lat: at[1], tier: r.sitelinks >= TIER1 ? 1 : r.sitelinks >= TIER2 ? 2 : 3, sitelinks: r.sitelinks });
  }
  out.sort((a, b) => b.sitelinks - a.sitelinks || a.name.localeCompare(b.name));
  // Promote each borough's strongest names so the citywide view covers all five.
  for (const b of Object.values(BOROUGH_QIDS)) {
    out.filter((l) => l.borough === b && !INCLUDE[l.id]).slice(0, TIER1_PER_BOROUGH).forEach((l) => (l.tier = 1));
  }
  return out;
}
