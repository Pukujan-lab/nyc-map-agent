import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Last real data on a repeat visit (#368). Slow-changing data (line shapes and
 * stations, the bus line list, district outlines) is saved in IndexedDB after
 * it loads and put back at the next start, so the map draws it before the
 * network answers. It is then marked stale, so React Query refreshes it in the
 * background as usual. Live positions, alerts and anything about one place are
 * never kept: old trains drawn as if live would mislead.
 */
const KEEP: QueryKey[] = [["transit", "static"], ["transit", "meta"], ["transit", "bus-lines"], ["transit", "xray"], ["district-boundaries"]];
/** Older than this is not worth showing. */
export const KEEP_MAX_AGE_MS = 3 * 24 * 3600_000;
const DB = "nma-cache";
const STORE = "queries";
const ROW = "last";

export type KeptQuery = { key: QueryKey; data: unknown; at: number };

export function isKept(key: QueryKey): boolean {
  return KEEP.some((k) => k.every((part, i) => key[i] === part));
}

/** The kept queries worth saving right now: loaded, successful, on the list. */
export function snapshot(client: QueryClient): KeptQuery[] {
  return client.getQueryCache().getAll()
    .filter((q) => isKept(q.queryKey) && q.state.status === "success" && q.state.data !== undefined)
    .map((q) => ({ key: q.queryKey, data: q.state.data, at: q.state.dataUpdatedAt }));
}

/** Puts kept data back, never over data that already arrived, then marks it for a background refresh. */
export function restore(client: QueryClient, rows: readonly KeptQuery[], now = Date.now()): number {
  let n = 0;
  for (const r of rows) {
    if (!isKept(r.key) || now - r.at > KEEP_MAX_AGE_MS) continue;
    if (client.getQueryState(r.key)?.dataUpdatedAt) continue;
    client.setQueryData(r.key, r.data, { updatedAt: r.at });
    void client.invalidateQueries({ queryKey: r.key, exact: true }, { cancelRefetch: false });
    n++;
  }
  return n;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function read(): Promise<KeptQuery[]> {
  const db = await open();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(ROW);
    req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as KeptQuery[]) : []);
    req.onerror = () => resolve([]);
  });
}

async function write(rows: KeptQuery[]): Promise<void> {
  const db = await open();
  db.transaction(STORE, "readwrite").objectStore(STORE).put(rows, ROW);
}

/** Restores at start and saves after each kept query loads. Does nothing where IndexedDB is missing or blocked. */
export function keepLastData(client: QueryClient): void {
  if (typeof indexedDB === "undefined") return;
  read().then((rows) => restore(client, rows)).catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  client.getQueryCache().subscribe((e) => {
    if (e.type !== "updated" || e.action.type !== "success" || !isKept((e.query as Query).queryKey)) return;
    clearTimeout(timer);
    timer = setTimeout(() => void write(snapshot(client)).catch(() => {}), 2000);
  });
}
