/** Tiny in-process TTL cache for upstream feeds (per server instance). */
const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), value });
  value.catch(() => store.delete(key));
  if (store.size > 500) store.delete(store.keys().next().value as string);
  return value;
}

export const NWS_HEADERS = {
  "user-agent": "nyc-map-agent (github.com/Pukujan/nyc-map-agent)",
  accept: "application/geo+json",
};

export async function getJson(url: string, headers?: Record<string, string>, timeoutMs = 8000): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}
