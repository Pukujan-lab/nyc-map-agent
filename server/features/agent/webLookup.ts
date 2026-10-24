/**
 * Event lookup on the open web through TinyFish (search + fetch), for questions
 * like "where is the 3 Percent Club event today". Runs only when the user asks
 * about a named event; nothing is crawled or stored. TINYFISH_API_KEY is read
 * here only and never sent to the client. Without a key both calls say the
 * lookup is unavailable, so the agent says so instead of guessing.
 */
import { noteSource } from "./freshness";

const SEARCH = "https://api.search.tinyfish.ai";
const FETCH = "https://api.fetch.tinyfish.ai";
const MAX_TEXT = 6000;

export interface WebResult { title: string; url: string; snippet: string; date: string | null; site: string | null }
export type Unavailable = { unavailable: true; reason: string };

const key = () => process.env.TINYFISH_API_KEY ?? "";

/** Search the web, New York results first. */
export async function webSearch(query: string, fetchImpl: typeof fetch = fetch): Promise<{ results: WebResult[] } | Unavailable> {
  if (!key()) return { unavailable: true, reason: "Event lookup is not set up on this server (no TINYFISH_API_KEY)." };
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
  if (!key()) return { unavailable: true, reason: "Event lookup is not set up on this server (no TINYFISH_API_KEY)." };
  if (!readableUrl(url)) return { unavailable: true, reason: "That address can't be read." };
  const r = await fetchImpl(FETCH, { method: "POST", headers: { "X-API-Key": key(), "content-type": "application/json" }, body: JSON.stringify({ urls: [url] }), signal: AbortSignal.timeout(20_000) });
  if (!r.ok) return { unavailable: true, reason: `Reading the page failed (${r.status}).` };
  const d = (await r.json()) as { results?: Array<{ final_url?: string; url?: string; title?: string; description?: string; text?: string }> };
  const p = d.results?.[0];
  if (!p) return { unavailable: true, reason: "The page could not be read." };
  noteSource("web-page");
  return { title: p.title ?? "", url: p.final_url ?? p.url ?? url, description: (p.description ?? "").slice(0, 500), text: (p.text ?? "").replace(/\s+/g, " ").slice(0, MAX_TEXT) };
}
