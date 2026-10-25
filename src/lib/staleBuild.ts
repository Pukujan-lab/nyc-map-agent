/**
 * After a deploy, a tab opened earlier still asks for the old build's chunks
 * (My day, the layers, each feature), which no longer exist. Reload once to
 * pick up the new build instead of leaving a blank page.
 */
const KEY = "nyc-map:reloaded-for-build";

export function isChunkError(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|module script.*MIME type|ChunkLoadError/i.test(m);
}

/** Reloads unless it already did in the last minute (so a real outage cannot loop). Returns whether it reloaded. */
export function reloadOnce(
  storage: Pick<Storage, "getItem" | "setItem"> | null = safeSession(),
  now = Date.now(),
  reload: () => void = () => window.location.reload(),
): boolean {
  const last = Number(storage?.getItem(KEY) ?? 0);
  if (last && now - last < 60_000) return false;
  try {
    storage?.setItem(KEY, String(now));
  } catch {
    return false; // storage blocked: no guard against a loop, so don't reload
  }
  reload();
  return true;
}

/** Vite fires this when a lazy chunk or its CSS fails to load. */
export function watchStaleBuild(): void {
  window.addEventListener("vite:preloadError", (e) => {
    if (reloadOnce()) e.preventDefault();
  });
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
