/**
 * The street mart keeps each street under the spelling of its source: 311
 * noise reports say "WEST 44 STREET", police crash reports say "W 44 ST", and
 * the basemap says "West 44th Street". One street, three keys. These helpers
 * turn any of them into every spelling the mart might hold, and fold the rows
 * those spellings return back into one row per borough.
 */

const FIRST: Record<string, string[]> = {
  WEST: ["W"],
  W: ["WEST"],
  EAST: ["E"],
  E: ["EAST"],
  NORTH: ["N"],
  N: ["NORTH"],
  SOUTH: ["S"],
  S: ["SOUTH"],
};

const LAST: Record<string, string[]> = {
  STREET: ["ST"],
  ST: ["STREET"],
  AVENUE: ["AVE", "AV"],
  AVE: ["AVENUE", "AV"],
  AV: ["AVENUE", "AVE"],
  PLACE: ["PL"],
  PL: ["PLACE"],
  BOULEVARD: ["BLVD"],
  BLVD: ["BOULEVARD"],
  ROAD: ["RD"],
  RD: ["ROAD"],
  DRIVE: ["DR"],
  DR: ["DRIVE"],
  PARKWAY: ["PKWY"],
  PKWY: ["PARKWAY"],
  LANE: ["LN"],
  LN: ["LANE"],
  TERRACE: ["TER"],
  TER: ["TERRACE"],
  COURT: ["CT"],
  CT: ["COURT"],
  HIGHWAY: ["HWY"],
  HWY: ["HIGHWAY"],
  EXPRESSWAY: ["EXPY"],
  EXPY: ["EXPRESSWAY"],
  SQUARE: ["SQ"],
  SQ: ["SQUARE"],
};

const ORDINAL_WORDS = [
  "", "FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH",
  "SEVENTH", "EIGHTH", "NINTH", "TENTH", "ELEVENTH", "TWELFTH",
];

/** Spellings one token can take: 44TH -> 44, EIGHTH -> 8, 8 -> EIGHTH. */
function tokenOptions(token: string, i: number, last: number): string[] {
  const out = new Set([token]);
  const ordinal = /^(\d+)(ST|ND|RD|TH)$/.exec(token);
  const n = ordinal ? Number(ordinal[1]) : /^\d+$/.test(token) ? Number(token) : ORDINAL_WORDS.indexOf(token);
  if (n > 0) {
    out.add(String(n));
    if (n < ORDINAL_WORDS.length) out.add(ORDINAL_WORDS[n]);
  }
  // A first word is a direction only when a name follows it ("E 14 ST", not "E ST").
  if (i === 0 && last > 0) for (const s of FIRST[token] ?? []) out.add(s);
  // "ST" is Street only at the end; "ST MARKS PL" keeps its Saint.
  if (i === last && last > 0) for (const s of LAST[token] ?? []) out.add(s);
  return [...out];
}

/** Every spelling of `name` the mart may use, the input first; at most `max`. */
export function streetVariants(name: string, max = 32): string[] {
  const tokens = name.toUpperCase().replace(/[.,']/g, "").split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  let combos: string[][] = [[]];
  tokens.forEach((t, i) => {
    const opts = tokenOptions(t, i, tokens.length - 1);
    combos = combos.flatMap((c) => opts.map((o) => [...c, o])).slice(0, max);
  });
  return [...new Set([tokens.join(" "), ...combos.map((c) => c.join(" "))])].slice(0, max);
}

export interface StreetRow {
  street: string;
  borough: string | null;
  noise_12mo: string | number;
  noise_90d: string | number;
  crashes_12mo: string | number;
  injury_crashes_12mo: string | number;
  fatal_crashes_12mo: string | number;
  noise_level: string | null;
  crash_level: string | null;
}

export interface MergedStreetRow {
  borough: string;
  noise_12mo: number;
  noise_90d: number;
  crashes_12mo: number;
  injury_crashes_12mo: number;
  fatal_crashes_12mo: number;
  noise_level: string | null;
  crash_level: string | null;
}

const COUNTS = ["noise_12mo", "noise_90d", "crashes_12mo", "injury_crashes_12mo", "fatal_crashes_12mo"] as const;

/**
 * One row per borough. Counts add up across spellings; each level comes from
 * the spelling that holds most of that metric, because a spelling with no
 * noise reports still gets a noise quartile and must not decide the colour.
 * Rows without a borough are dropped: they cannot be placed.
 */
export function mergeStreetRows(rows: readonly StreetRow[]): MergedStreetRow[] {
  const by = new Map<string, { row: MergedStreetRow; noiseTop: number; crashTop: number }>();
  for (const r of rows) {
    if (!r.borough) continue;
    let e = by.get(r.borough);
    if (!e) {
      e = {
        row: { borough: r.borough, noise_12mo: 0, noise_90d: 0, crashes_12mo: 0, injury_crashes_12mo: 0, fatal_crashes_12mo: 0, noise_level: null, crash_level: null },
        noiseTop: -1,
        crashTop: -1,
      };
      by.set(r.borough, e);
    }
    for (const k of COUNTS) e.row[k] += Number(r[k]) || 0;
    const noise = Number(r.noise_12mo) || 0;
    const crashes = Number(r.crashes_12mo) || 0;
    if (noise > e.noiseTop) {
      e.noiseTop = noise;
      e.row.noise_level = r.noise_level;
    }
    if (crashes > e.crashTop) {
      e.crashTop = crashes;
      e.row.crash_level = r.crash_level;
    }
  }
  return [...by.values()]
    .map((e) => e.row)
    .sort((a, b) => b.noise_12mo + b.crashes_12mo - (a.noise_12mo + a.crashes_12mo));
}
