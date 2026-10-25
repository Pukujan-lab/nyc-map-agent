/**
 * Event lookup on the open web, for questions like "where is the 3 Percent
 * Club event today". Tavily answers first; TinyFish (search + fetch) is the
 * fallback when Tavily has no key, fails or finds nothing. Runs only when the
 * user asks about a named event; nothing is crawled or stored. TAVILY_API_KEY
 * and TINYFISH_API_KEY are read here only and never sent to the client.
 * Without either key both calls say the lookup is unavailable, so the agent
 * says so instead of guessing.
 */
import { noteSource } from "./freshness";

const SEARCH = "https://api.search.tinyfish.ai";
const FETCH = "https://api.fetch.tinyfish.ai";
const MAX_TEXT = 6000;

export interface WebResult { title: string; url: string; snippet: string; date: string | null; site: string | null }
export type Unavailable = { unavailable: true; reason: string };

const TAVILY = "https://api.tavily.com";

const key = () => process.env.TINYFISH_API_KEY ?? "";
const tavilyKey = () => process.env.TAVILY_API_KEY ?? "";
const NO_KEYS: Unavailable = { unavailable: true, reason: "Event lookup is not set up on this server (no TAVILY_API_KEY or TINYFISH_API_KEY)." };

/** Tavily search; null when it has no key, fails or finds nothing, so TinyFish gets a turn. */
async function tavilySearch(query: string, fetchImpl: typeof fetch): Promise<WebResult[] | null> {
  if (!tavilyKey()) return null;
  try {
    const r = await fetchImpl(`${TAVILY}/search`, { method: "POST", headers: { authorization: `Bearer ${tavilyKey()}`, "content-type": "application/json" }, body: JSON.stringify({ query, max_results: 8, search_depth: "basic" }), signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
    const out = (d.results ?? []).slice(0, 8).map((x) => ({ title: x.title ?? "", url: x.url ?? "", snippet: (x.content ?? "").slice(0, 300), date: x.published_date ?? null, site: x.url ? new URL(x.url).hostname : null }));
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** Tavily page read; null when it can't, so TinyFish gets a turn. */
async function tavilyRead(url: string, fetchImpl: typeof fetch): Promise<{ title: string; url: string; description: string; text: string } | null> {
  if (!tavilyKey()) return null;
  try {
    const r = await fetchImpl(`${TAVILY}/extract`, { method: "POST", headers: { authorization: `Bearer ${tavilyKey()}`, "content-type": "application/json" }, body: JSON.stringify({ urls: [url] }), signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { results?: Array<{ url?: string; raw_content?: string }> };
    const p = d.results?.[0];
    if (!p?.raw_content) return null;
    const text = p.raw_content.replace(/\s+/g, " ");
    return { title: text.slice(0, 120), url: p.url ?? url, description: "", text: text.slice(0, MAX_TEXT) };
  } catch {
    return null;
  }
}

/** Search the web, New York results first: Tavily, then TinyFish. */
export async function webSearch(query: string, fetchImpl: typeof fetch = fetch): Promise<{ results: WebResult[] } | Unavailable> {
  const viaTavily = await tavilySearch(query, fetchImpl);
  if (viaTavily) { noteSource("web-search"); return { results: viaTavily }; }
  if (!key()) return tavilyKey() ? { results: [] } : NO_KEYS;
  const url = `${SEARCH}?${new URLSearchParams({ query, location: "US", language: "en" })}`;
  const r = await fetchImpl(url, { headers: { "X-API-Key": key() }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) return { unavailable: true, reason: `Web search failed (${r.status}).` };
  const d = (await r.json()) as { results?: Array<{ title?: string; url?: string; snippet?: string; date?: string; site_name?: string }> };
  noteSource("web-search");
  return {
    results: (d.results ?? []).slice(0, 8).map((x) => ({ title: x.title ?? "", url: x.url ?? "", snippet: (x.snippet ?? "").slice(0, 300), date: x.date ?? null, site: x.site_name ?? null })),
  };
}

/** Is this a public web page we may read (http(s), not a private or local address)? Pure, for tests. */
export function readableUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase();
  return !(h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h.includes(":"));
}

/** Read one event page as text (title, description, the first part of the body). */
export async function readPage(url: string, fetchImpl: typeof fetch = fetch): Promise<{ title: string; url: string; description: string; text: string } | Unavailable> {
  if (!readableUrl(url)) return { unavailable: true, reason: "That address can't be read." };
  const viaTavily = await tavilyRead(url, fetchImpl);
  if (viaTavily) { noteSource("web-page"); return viaTavily; }
  if (!key()) return tavilyKey() ? { unavailable: true, reason: "The page could not be read." } : NO_KEYS;
  const r = await fetchImpl(FETCH, { method: "POST", headers: { "X-API-Key": key(), "content-type": "application/json" }, body: JSON.stringify({ urls: [url] }), signal: AbortSignal.timeout(20_000) });
  if (!r.ok) return { unavailable: true, reason: `Reading the page failed (${r.status}).` };
  const d = (await r.json()) as { results?: Array<{ final_url?: string; url?: string; title?: string; description?: string; text?: string }> };
  const p = d.results?.[0];
  if (!p) return { unavailable: true, reason: "The page could not be read." };
  noteSource("web-page");
  return { title: p.title ?? "", url: p.final_url ?? p.url ?? url, description: (p.description ?? "").slice(0, 500), text: (p.text ?? "").replace(/\s+/g, " ").slice(0, MAX_TEXT) };
}

const NYC = /new york|nyc|brooklyn|queens|manhattan|bronx|staten/i;

/**
 * A named event, searched wider when the first try finds nothing: the name in
 * New York, then on the usual event sites, then the name alone.
 */
export async function findEvent(query: string, fetchImpl: typeof fetch = fetch): Promise<{ results: WebResult[] } | Unavailable> {
  const tries = [NYC.test(query) ? query : `${query} New York`, `${query} event (luma OR eventbrite OR meetup OR partiful)`, query];
  let last: { results: WebResult[] } | Unavailable = { results: [] };
  for (const q of [...new Set(tries)]) {
    last = await webSearch(q, fetchImpl);
    if ("unavailable" in last || last.results.length) return last;
  }
  return last;
}
