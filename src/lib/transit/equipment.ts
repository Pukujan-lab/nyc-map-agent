/**
 * MTA elevator and escalator text ("42 St & 6th Ave (SW corner) to mezzanine")
 * parsed into the street corner it reaches. Shared by scripts/build-equipment.ts
 * and the station exit view. Pure, for tests.
 */

export interface StreetUnit {
  id: string;
  /** EL elevator, ES escalator. */
  type: "EL" | "ES";
  /** GTFS stop ids it serves. */
  stops: string[];
  /** The MTA's own words, kept as written. */
  serving: string;
  streets: string[];
  corner: string;
}

const CORNER = /([A-Za-z0-9 .&'-]+?)\s*(?:entrance\s*)?\((NE|NW|SE|SW) corner\)/i;

/** "E 14 St and Avenue A (SW corner) to …" → streets ["E 14 St", "Avenue A"], corner "SW". */
export function parseCorner(serving: string): { streets: string[]; corner: string } | null {
  const m = CORNER.exec(serving);
  if (!m) return null;
  // The text before the corner may start with "… mezzanine to 42 St & 7th Ave": keep what follows the last " to ".
  const place = m[1].split(/\s+to\s+/i).pop() ?? m[1];
  const streets = place
    .split(/\s*(?:&|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!streets.length) return null;
  return { streets, corner: m[2].toUpperCase() };
}

/** Number and name tokens, so "W 42nd Street" and "42 St" match: ["42"], "7th Avenue" and "7 Av": ["7"]. */
function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !/^(st|street|av|ave|avenue|e|w|n|s|east|west|north|south|the|of|pl|place|blvd|rd|road)$/.test(w)),
  );
}

/**
 * The MTA unit for an elevator or escalator entrance: same type, a stop it
 * serves, the same corner, and (when street names are known) a shared street.
 * Null when nothing matches clearly: the derived name is used instead.
 */
export function matchUnit(
  units: StreetUnit[],
  e: { kind: string; stopIds: string[]; corner: string | null; streets: string[] | null },
): StreetUnit | null {
  const type = /elevator/i.test(e.kind) ? "EL" : /escalator/i.test(e.kind) ? "ES" : null;
  if (!type || !e.corner) return null;
  const mine = new Set(e.stopIds);
  const want = e.streets ? e.streets.flatMap((s) => [...tokens(s)]) : null;
  const hits = units.filter(
    (u) =>
      u.type === type &&
      u.corner === e.corner &&
      u.stops.some((s) => mine.has(s)) &&
      (!want || u.streets.some((s) => [...tokens(s)].some((t) => want.includes(t)))),
  );
  return hits.length === 1 ? hits[0] : null;
}
