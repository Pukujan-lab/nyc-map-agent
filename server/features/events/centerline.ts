import { z } from "zod";
import type { EventGeometry, PermittedEventRow } from "./schema";
import { parseBetween } from "./normalize";

/**
 * Geocodes permitted events, which carry only a street description such as
 * "CARROLL STREET between ROGERS AVENUE and NOSTRAND AVENUE".
 *
 * Street blocks: NYC's own street centerline (DCP CSCL, NYC Open Data
 * inkn-q76z). An intersection is a segment endpoint shared by both streets,
 * so the block becomes a LineString between the two cross streets (a Point
 * when only one end resolves). Park locations ("Union Square Park: North
 * Plaza") go to NYC Planning GeoSearch, the geocoder the app already uses.
 * Anything that resolves to neither is skipped.
 */
const CSCL = "https://data.cityofnewyork.us/resource/inkn-q76z.json";
const GEOSEARCH = "https://geosearch.planninglabs.nyc/v2/search";

const BOROUGH_CODE: Record<string, string> = { Manhattan: "1", Bronx: "2", Brooklyn: "3", Queens: "4", "Staten Island": "5" };

const WORDS: Array<[RegExp, string]> = [
  [/\bSTREET\b/g, "ST"], [/\bAVENUE\b/g, "AVE"], [/\bAV\b/g, "AVE"], [/\bBOULEVARD\b/g, "BLVD"], [/\bROAD\b/g, "RD"],
  [/\bPLACE\b/g, "PL"], [/\bPARKWAY\b/g, "PKWY"], [/\bDRIVE\b/g, "DR"], [/\bTERRACE\b/g, "TER"], [/\bLANE\b/g, "LN"],
  [/\bCOURT\b/g, "CT"], [/\bEXPRESSWAY\b/g, "EXPY"], [/\bHIGHWAY\b/g, "HWY"], [/\bSQUARE\b/g, "SQ"], [/\bBEACH\b/g, "BCH"],
  [/\bFT\b/g, "FORT"],
  [/\bFIRST\b/g, "1"], [/\bSECOND\b/g, "2"], [/\bTHIRD\b/g, "3"], [/\bFOURTH\b/g, "4"], [/\bFIFTH\b/g, "5"],
  [/\bSIXTH\b/g, "6"], [/\bSEVENTH\b/g, "7"], [/\bEIGHTH\b/g, "8"], [/\bNINTH\b/g, "9"], [/\bTENTH\b/g, "10"],
  [/\b(\d+)(ST|ND|RD|TH)\b/g, "$1"],
];

const DIRS: Array<[RegExp, string]> = [[/\bEAST\b/g, "E"], [/\bWEST\b/g, "W"], [/\bNORTH\b/g, "N"], [/\bSOUTH\b/g, "S"]];

/** Event street -> CSCL suffix style ("WEST  117 STREET" -> "WEST 117 ST"), spaces collapsed. */
function toCsclName(street: string): string {
  let s = street.toUpperCase().replace(/\s+/g, " ").trim();
  for (const [re, to] of WORDS) s = s.replace(re, to);
  return s;
}

/** Abbreviates directions too, so "WEST BROADWAY" / "W BROADWAY" compare equal. */
const abbreviateDirs = (s: string) => DIRS.reduce((acc, [re, to]) => acc.replace(re, to), s);

/**
 * Spellings to ask CSCL for: Socrata pads numbered streets ("W  117 ST",
 * "E   42 ST") and the padding differs between datasets, so try 1-4 spaces.
 */
export function csclVariants(street: string): string[] {
  const full = toCsclName(street);
  const out = new Set([full, abbreviateDirs(full)]);
  for (const v of [...out]) {
    const m = /^(E|W|N|S|BCH) (\d+)( .*)$/.exec(v);
    if (m) for (const n of [2, 3, 4]) out.add(`${m[1]}${" ".repeat(n)}${m[2]}${m[3]}`);
  }
  return [...out];
}

/** Comparison key: CSCL and events pad numbers differently, so collapse spaces. */
export const streetKey = (s: string): string => abbreviateDirs(toCsclName(s));

const CsclRow = z.object({
  full_street_name: z.string(),
  boroughcode: z.string(),
  the_geom: z.object({ type: z.string(), coordinates: z.array(z.array(z.array(z.number()))).or(z.array(z.array(z.number()))) }),
});
export const CsclRows = z.array(CsclRow);
type CsclRow = z.infer<typeof CsclRow>;

type Fetch = (url: string) => Promise<unknown>;
const pt = (p: number[]): [number, number] => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const pkey = (p: number[]) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

/** Endpoint index for one borough: point -> streets meeting there. */
export class Intersections {
  private ends = new Map<string, { at: [number, number]; streets: Set<string> }>();

  add(rows: CsclRow[]): void {
    for (const r of rows) {
      const g = r.the_geom;
      const lines = (g.type === "MultiLineString" ? g.coordinates : [g.coordinates]) as number[][][];
      for (const line of lines) {
        for (const p of [line[0], line[line.length - 1]]) {
          if (!p) continue;
          const k = pkey(p);
          const e = this.ends.get(k) ?? { at: pt(p), streets: new Set<string>() };
          e.streets.add(streetKey(r.full_street_name));
          this.ends.set(k, e);
        }
      }
    }
  }

  /** Where streets a and b meet (both as streetKey), or null. */
  find(a: string, b: string): [number, number] | null {
    for (const e of this.ends.values()) if (e.streets.has(a) && e.streets.has(b)) return e.at;
    return null;
  }
}

/** Socrata `in (...)` list, quotes escaped. */
const soqlList = (names: string[]) => names.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");

/** Loads CSCL segments for every street named in the rows, per borough (small, indexed `in` queries). */
export async function loadIntersections(rows: PermittedEventRow[], fetchJson: Fetch): Promise<Map<string, Intersections>> {
  const wanted = new Map<string, Set<string>>();
  for (const r of rows) {
    const b = parseBetween(r.event_location);
    const code = BOROUGH_CODE[r.event_borough];
    if (!b || !code) continue;
    const set = wanted.get(code) ?? new Set<string>();
    for (const s of [b.on, b.from, b.to]) for (const v of csclVariants(s)) set.add(v);
    wanted.set(code, set);
  }
  const out = new Map<string, Intersections>();
  for (const [code, names] of wanted) {
    const idx = new Intersections();
    const list = [...names];
    for (let i = 0; i < list.length; i += 40) {
      const where = `boroughcode='${code}' AND full_street_name in (${soqlList(list.slice(i, i + 40))})`;
      const q = new URLSearchParams({ $select: "full_street_name,boroughcode,the_geom", $where: where, $limit: "50000" });
      idx.add(CsclRows.parse(await fetchJson(`${CSCL}?${q}`)));
    }
    out.set(code, idx);
  }
  return out;
}

const GeoSearch = z.object({ features: z.array(z.object({ geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }) })) });

/** First GeoSearch hit for a place name in a borough. */
export async function geosearch(text: string, fetchJson: Fetch): Promise<[number, number] | null> {
  const data = GeoSearch.parse(await fetchJson(`${GEOSEARCH}?${new URLSearchParams({ text, size: "1" })}`));
  const c = data.features[0]?.geometry.coordinates;
  return c ? pt(c) : null;
}

/** Street block -> LineString / Point from the centerline index; null when neither end resolves. */
export function locateBlock(row: PermittedEventRow, index: Map<string, Intersections>): EventGeometry | null {
  const b = parseBetween(row.event_location);
  const idx = index.get(BOROUGH_CODE[row.event_borough] ?? "");
  if (!b || !idx) return null;
  const on = streetKey(b.on);
  const a = idx.find(on, streetKey(b.from));
  const z2 = idx.find(on, streetKey(b.to));
  if (a && z2 && (a[0] !== z2[0] || a[1] !== z2[1])) return { type: "LineString", coordinates: [a, z2] };
  const one = a ?? z2;
  return one ? { type: "Point", coordinates: one } : null;
}

/** "Union Square Park: North Plaza ,Union Square Park: X" -> "Union Square Park". */
export function parkName(location: string): string | null {
  const m = /^([^:,]+):/.exec(location.trim());
  return m ? m[1].trim() : null;
}
