/**
 * Deterministic voice intents: the core asks answered without any language
 * model, so voice keeps working when the model key fails. Pure and synchronous;
 * station and line lookup use the static transit data passed in.
 */
type Direction = "uptown" | "downtown" | null;
export type Intent =
  | { kind: "arrivals"; mode: "train" | "bus"; place: string; stationId: string | null; route: string | null; direction: Direction }
  | { kind: "status"; route: string }
  | { kind: "directions"; to: string }
  | { kind: "restroom" }
  | { kind: "weather" }
  | { kind: "follow"; route: string }
  | { kind: "stop" };

export interface Catalog {
  /** Station id → display name (subway static data). */
  stations: Array<{ id: string; name: string; routes?: string[] }>;
  /** Line ids such as "A", "7", "GS", "SI". */
  routes: string[];
}

const SPOKEN_LINES: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  ay: "A", bee: "B", see: "C", sea: "C", dee: "D", ee: "E", eff: "F", gee: "G", jay: "J", el: "L", em: "M", en: "N", queue: "Q", cue: "Q", are: "R", ar: "R", double: "W", zee: "Z",
  shuttle: "GS",
};

/** Lowercase, drop punctuation, normalise street words so "42nd Street" ≈ "42 St". */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "av")
    .replace(/\bave\b/g, "av")
    .replace(/\bsquare\b/g, "sq")
    .replace(/\b(station|stop|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Small token-overlap + prefix score; enough for ~500 station names. */
function score(q: string, name: string): number {
  const qt = q.split(" ").filter(Boolean);
  const nt = norm(name).split(" ");
  if (!qt.length) return 0;
  let hit = 0;
  for (const t of qt) if (nt.some((n) => n === t || (t.length > 2 && n.startsWith(t)))) hit += 1;
  const exact = norm(name) === q ? 0.5 : 0;
  return hit / qt.length - (nt.length - hit) * 0.02 + exact;
}

function matchStation(text: string, cat: Catalog, route: string | null = null): { id: string; name: string } | null {
  const q = norm(text);
  let best: { id: string; name: string } | null = null;
  let bestS = 0.6;
  for (const s of cat.stations) {
    const v = score(q, s.name) + (route && s.routes?.includes(route) ? 0.01 : 0);
    if (v > bestS) { bestS = v; best = s; }
  }
  return best;
}

function matchRoute(word: string, cat: Catalog): string | null {
  const w = word.trim().toLowerCase().replace(/^the\s+/, "");
  const cand = SPOKEN_LINES[w] ?? w.toUpperCase();
  return cat.routes.includes(cand) ? cand : null;
}

const LINE = String.raw`(?:the\s+)?([a-z0-9]+)`;

export function parseIntent(raw: string, cat: Catalog): Intent | null {
  const t = raw.toLowerCase().replace(/[?!.]+$/g, "").replace(/^(hey,? map|ok|okay|please|siri)[, ]+/i, "").trim();
  if (/^(stop|stop listening|cancel|never ?mind|quiet|be quiet)$/.test(t)) return { kind: "stop" };
  if (/\b(restroom|bathroom|toilet|washroom|loo|pee)\b/.test(t)) return { kind: "restroom" };
  if (/\b(weather|rain(ing)?|umbrella|temperature|forecast|how (hot|cold))\b/.test(t)) return { kind: "weather" };

  let m = new RegExp(String.raw`\b(?:follow|track|ride along with)\s+${LINE}(?:\s+(?:train|line))?\b`).exec(t);
  if (m) { const r = matchRoute(m[1], cat); if (r) return { kind: "follow", route: r }; }

  m = new RegExp(String.raw`\b(?:status|delays?|running|problems?|issues?|service|alerts?)\b.*?\b(?:on|of|for|with)\s+${LINE}(?:\s+(?:train|line))?\s*$`).exec(t)
    ?? new RegExp(String.raw`^(?:is|are)\s+${LINE}(?:\s+(?:train|line))?\s+(?:running|delayed|ok|okay|on time)`).exec(t)
    ?? new RegExp(String.raw`^${LINE}(?:\s+(?:train|line))?\s+(?:status|delays?|service)$`).exec(t);
  if (m) { const r = matchRoute(m[1], cat); if (r) return { kind: "status", route: r }; }

  const dir: Direction = /\b(uptown|northbound|north)\b/.test(t) ? "uptown" : /\b(downtown|southbound|south)\b/.test(t) ? "downtown" : null;
  m = /\b(?:next|when(?:'?s| is)? the next|when does the next|how long (?:for|until) the next)\s+(?:(uptown|downtown|northbound|southbound)\s+)?([a-z0-9]+\s+)?(train|bus|subway)\b.*?\b(?:at|from|to|in)\s+(.+)$/.exec(t)
    ?? /\b(trains?|bus(?:es)?|arrivals?|departures?)\b.*?\b(?:at|from)\s+(.+)$/.exec(t);
  if (m) {
    const place = (m.length === 5 ? m[4] : m[2]).replace(/\b(uptown|downtown|northbound|southbound)\b/g, "").trim();
    const word = m.length === 5 ? m[3] : m[1];
    const mode = /bus/.test(word) ? "bus" : "train";
    const route = m.length === 5 && m[2] ? matchRoute(m[2], cat) : null;
    const st = mode === "train" ? matchStation(place, cat, route) : null;
    return { kind: "arrivals", mode, place, stationId: st?.id ?? null, route, direction: dir };
  }

  m = /\b(?:directions?|route|navigate|take me|get me|how do i get|how to get|walk me|guide me)\b(?:\s+me)?\s+(?:to|towards)\s+(.+)$/.exec(t);
  if (m) return { kind: "directions", to: m[1].trim() };
  return null;
}
