/**
 * One formatter for street names in the UI: "W 44 St" → "West 44 Street",
 * "St Marks Pl" → "St. Marks Place". Street *types* expand only as the
 * suffix (or before a trailing directional/letter), so "St" as Saint stays.
 * Not for station names (MTA spelling stays) or green blade signs.
 */
const TYPES: Record<string, string> = {
  st: "Street", str: "Street", av: "Avenue", ave: "Avenue", avn: "Avenue", blvd: "Boulevard",
  pl: "Place", rd: "Road", dr: "Drive", pkwy: "Parkway", pky: "Parkway", expy: "Expressway",
  expwy: "Expressway", hwy: "Highway", sq: "Square", ln: "Lane", ter: "Terrace", plz: "Plaza", terr: "Terrace", ct: "Court",
};
const DIRS: Record<string, string> = { n: "North", s: "South", e: "East", w: "West" };
/** Words that may follow the street type: "Avenue A", "Street East", "Av of the Americas". */
const AFTER_TYPE = /^([a-z]|[nsew]|north|south|east|west|ext|extension|of|the|americas)$/i;

function cap(w: string): string {
  if (/^\d/.test(w)) return w.toLowerCase();
  return w.length <= 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase();
}

export function formatStreetName(raw: string | null | undefined): string {
  if (!raw) return "";
  const allCaps = raw === raw.toUpperCase();
  const words = raw.trim().split(/\s+/);
  const out = words.map((w, i) => {
    const bare = w.replace(/\.$/, "");
    const k = bare.toLowerCase();
    const rest = words.slice(i + 1);
    // Leading directional before the name: "W 44 St", "E Broadway".
    if (i === 0 && DIRS[k] && rest.length > 0) return DIRS[k];
    if (TYPES[k] && i > 0 && rest.every((r) => AFTER_TYPE.test(r.replace(/\.$/, "")))) {
      // "Avenue A", "Av of the Americas": the type is the suffix or before a letter/directional.
      return TYPES[k];
    }
    // Trailing directional after a street type: "Union Sq E", "Pelham Pkwy S".
    if (DIRS[k] && i > 1 && rest.length === 0 && TYPES[words[i - 1].replace(/\.$/, "").toLowerCase()]) return DIRS[k];
    if (TYPES[k] && i === 0 && k !== "st" && /^of$/i.test(rest[0] ?? "")) return TYPES[k];
    if (TYPES[k] && i === 0 && k !== "st" && rest.length === 1 && /^[a-z]$/i.test(rest[0])) return TYPES[k]; // "Ave A"
    if (k === "st" && i === 0 && rest.length > 0) return "St."; // Saint
    if (k === "st" && i > 0 && rest.length > 0) return "St."; // "Mount St Mary"
    if (TYPES[k] && i === 0 && rest.length === 0) return TYPES[k];
    return allCaps ? cap(bare) + (w.endsWith(".") && bare !== w ? "." : "") : w;
  });
  return out.join(" ");
}

/** Format every street-looking part of an "A & B" / "A at B" label. */
export function formatStreetPair(label: string): string {
  return label
    .split(/(\s+(?:&|at|and)\s+)/)
    .map((p, i) => (i % 2 ? p : formatStreetName(p)))
    .join("");
}
