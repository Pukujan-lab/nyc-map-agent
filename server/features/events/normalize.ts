import type { EventGeometry, EventKind, ParksEventRow, PermittedEventRow } from "./schema";

/**
 * Turns NYC Open Data rows into normalised events. Pure functions, no I/O:
 * geocoding of permitted events (which carry only a street description) is
 * done by centerline.ts and passed in as `locate`.
 */

/** "2026-10-22T15:00:00.000" (New York wall time, Socrata floating timestamp) -> ISO with offset. */
export function nyLocalToIso(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) throw new Error(`bad timestamp ${local}`);
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? 0));
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  // Offset of New York at that instant; check twice to settle on DST edges.
  let offset = nyOffsetMinutes(asUtc);
  offset = nyOffsetMinutes(asUtc - offset * 60_000);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${pad(s)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Minutes New York is ahead of UTC at `ms` (e.g. -240 in EDT). */
function nyOffsetMinutes(ms: number): number {
  const p = Object.fromEntries(NY.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / 60_000);
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (all, n: string) => ENTITIES[n.toLowerCase()] ?? all)
    .trim();
}

/** "BROADWAY between WEST  113 STREET and WEST  116 STREET" -> the three streets. */
export function parseBetween(location: string): { on: string; from: string; to: string } | null {
  // Multi-block permits list several clauses separated by commas; use the first block.
  const clause = location.split(",").find((c) => /\sbetween\s/i.test(c)) ?? "";
  const m = /^(.+?)\s+between\s+(.+?)\s+and\s+(.+)$/i.exec(clause.trim());
  if (!m) return null;
  const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
  return { on: tidy(m[1]), from: tidy(m[2]), to: tidy(m[3]) };
}

/** Title-cases an all-caps street description for display: "WEST  117 STREET" -> "West 117 Street". */
function prettyStreet(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Permitted-event types that are not public happenings (sports leagues, film shoots, load-ins). */
const PERMITTED_SKIP = /^(sport\b|production event|theater load|filming)/i;
const SHOW = /\b(concert|music|jazz|perform|theat(er|re)|dance|film|movie|cinema|show|opera|comedy|band)\b/i;
const MARKET = /\b(market|greenmarket|grownyc|farmers?)\b/i;
const POPUP = /\b(pop[- ]?up|sidewalk sale|sample sale|vendor)\b/i;
const FAIR = /\b(fair|festival|fest|block party|celebration|carnival|bazaar)\b/i;

/** Kind for a permitted event, or null when it is not something to show. */
export function permittedKind(row: Pick<PermittedEventRow, "event_type" | "event_name" | "event_agency">): EventKind | null {
  const type = row.event_type;
  if (PERMITTED_SKIP.test(type)) return null;
  const name = row.event_name;
  if (/parks/i.test(row.event_agency) && type === "Special Event") {
    // Parks special-event permits are mostly lawn closures and contract work; keep the public ones.
    if (MARKET.test(name)) return "market";
    if (FAIR.test(name)) return "fair";
    if (SHOW.test(name)) return "show";
    return null;
  }
  if (type === "Farmers Market" || MARKET.test(name)) return "market";
  if (type === "Sidewalk Sale" || POPUP.test(name)) return "popup";
  if (/parade|athletic race|religious event/i.test(type)) return "closure";
  if (/festival|block party|plaza|open street|bike the block|health fair/i.test(type) || FAIR.test(name)) return "fair";
  if (SHOW.test(name)) return "show";
  return "other";
}

/** Parks categories that are recurring classes rather than happenings. */
const PARKS_SKIP = new Set(["Fitness", "Exercise Classes", "Shape Up NYC", "Recreation Center Programming", "Sports Camps", "Yoga & Pilates Classes", "Dance Classes"]);

function parksKind(row: Pick<ParksEventRow, "categories" | "title">): EventKind | null {
  const cats = (row.categories ?? "").split("|").map((c) => c.trim()).filter(Boolean);
  if (cats.length && cats.every((c) => PARKS_SKIP.has(c) || c === "Best for Kids" || c === "Seniors" || c === "Accessible Activities")) return null;
  if (cats.some((c) => PARKS_SKIP.has(c)) && !cats.some((c) => /festival|concert|film|movie|perform|market|food/i.test(c))) return null;
  const title = decodeEntities(row.title);
  if (MARKET.test(title)) return "market";
  if (cats.some((c) => /festival/i.test(c)) || FAIR.test(title)) return "fair";
  if (cats.some((c) => /concert|film|movie|perform|theat|music/i.test(c)) || SHOW.test(title)) return "show";
  return "parks";
}

/** "40.889, -73.892; 40.88, -73.89" -> first point as [lon, lat]. */
export function parseParksCoordinates(s: string | undefined): [number, number] | null {
  const first = (s ?? "").split(";")[0];
  const [lat, lon] = first.split(",").map((v) => Number(v.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 40.4 || lat > 41 || lon < -74.3 || lon > -73.6) return null;
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
}

export interface NormalisedEvent {
  id: string;
  title: string;
  kind: EventKind;
  start: string;
  end: string;
  location: EventGeometry;
  address: string | null;
  source: "nyc-permitted-events" | "nyc-parks-events";
  url: string | null;
}

/** Longest permitted event kept, in days. */
const MAX_PERMIT_DAYS = 14;

type Locator = (row: PermittedEventRow) => EventGeometry | null;

/** A permitted event, or null when skipped (not public, or no location found). */
export function fromPermitted(row: PermittedEventRow, locate: Locator): NormalisedEvent | null {
  const kind = permittedKind(row);
  if (!kind) return null;
  const start = nyLocalToIso(row.start_date_time);
  const end = nyLocalToIso(row.end_date_time);
  // Season-long permits (bump-outs, outreach tables) are not pop-ups; markets keep their season.
  if (kind !== "market" && Date.parse(end) - Date.parse(start) > MAX_PERMIT_DAYS * 86_400_000) return null;
  const location = locate(row);
  if (!location) return null;
  const b = parseBetween(row.event_location);
  const address = b
    ? `${prettyStreet(b.on)} between ${prettyStreet(b.from)} and ${prettyStreet(b.to)}, ${row.event_borough}`
    : `${row.event_location.split(",")[0].trim()}, ${row.event_borough}`;
  return {
    id: `permitted:${row.event_id}`,
    title: decodeEntities(row.event_name),
    kind,
    start,
    end,
    location,
    address,
    source: "nyc-permitted-events",
    url: "https://data.cityofnewyork.us/City-Government/NYC-Permitted-Event-Information/tvpp-9vvx",
  };
}

export function fromParks(row: ParksEventRow): NormalisedEvent | null {
  const kind = parksKind(row);
  if (!kind || !row.starttime) return null;
  const at = parseParksCoordinates(row.coordinates);
  if (!at) return null;
  const start = nyLocalToIso(row.starttime);
  return {
    id: `parks:${row.guid}`,
    title: decodeEntities(row.title),
    kind,
    start,
    end: row.endtime ? nyLocalToIso(row.endtime) : start,
    location: { type: "Point", coordinates: at },
    address: row.location ? decodeEntities(row.location) : row.parknames ?? null,
    source: "nyc-parks-events",
    url: row.link?.url.replace(/^http:/, "https:") ?? null,
  };
}
