/**
 * InferHub model fallback. The primary model comes from INFERHUB_MODEL (or
 * DEFAULT_MODEL); INFERHUB_MODEL_FALLBACKS is an optional comma-separated list
 * tried in order when a model is missing (4xx model_not_found), unpaid (402),
 * busy (429, or InferHub's "busy or rate-limited" message, retried first) or the provider fails (5xx). Implemented as a fetch wrapper so the AI SDK
 * provider keeps streaming as usual. Logs the provider error type only, never
 * the key or the request.
 */
export function modelChain(primary: string, fallbacks: string | undefined): string[] {
  const list = [primary, ...(fallbacks ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
  return [...new Set(list)];
}

/** Provider error type from an OpenAI-style error body, e.g. "model_not_found". */
export async function errorType(res: Response): Promise<string> {
  try {
    const j = (await res.clone().json()) as { error?: { type?: unknown; code?: unknown } | string; type?: unknown; code?: unknown };
    const e = typeof j.error === "object" && j.error ? j.error : j;
    const t = (e as { code?: unknown }).code ?? (e as { type?: unknown }).type;
    return typeof t === "string" ? t.replace(/[^\w.-]/g, "").slice(0, 64) : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * InferHub is a priced market: when every provider under the key's max price is
 * busy it answers with a message like "every provider within your price limit is
 * busy or rate-limited right now". It clears within seconds, so it is worth a retry.
 */
const BUSY = /busy|rate.?limit|price limit|overloaded|try again/i;

/** Short provider message from an error body, with anything key-shaped removed. Empty when there is none. */
export async function errorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.clone().json()) as { error?: { message?: unknown } | string; message?: unknown };
    const m = typeof j.error === "string" ? j.error : typeof j.error === "object" && j.error ? j.error.message : j.message;
    return typeof m === "string" ? m.replace(/\b(sk|ih|Bearer)[-_ ]?[\w.-]{8,}/gi, "[redacted]").slice(0, 160) : "";
  } catch {
    return "";
  }
}

export const isBusy = (status: number, message: string): boolean => status === 429 || BUSY.test(message);

export function shouldFallBack(status: number, type: string): boolean {
  return status === 402 || status === 429 || status >= 500 || (status >= 400 && status < 500 && /model_not_found|model.not.found|invalid_model/i.test(type));
}

const BUSY_RETRIES = 2;
const BUSY_WAIT_MS = 600;

export function fallbackFetch(models: string[], base: typeof fetch = fetch, log: (m: string) => void = console.warn, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): typeof fetch {
  return async (input, init) => {
    const body = typeof init?.body === "string" ? init.body : null;
    let parsed: Record<string, unknown> | null = null;
    try { parsed = body ? (JSON.parse(body) as Record<string, unknown>) : null; } catch { parsed = null; }
    if (!parsed || typeof parsed.model !== "string") return base(input, init);
    const send = (model: string) => base(input, { ...init, body: JSON.stringify({ ...parsed, model }) });
    let last: Response | undefined;
    for (let i = 0; i < models.length; i++) {
      let res = await send(models[i]);
      // A busy market usually clears within a second or two: retry the same model before giving up on it.
      for (let r = 0; !res.ok && r < BUSY_RETRIES; r++) {
        const msg = await errorMessage(res);
        if (!isBusy(res.status, msg)) break;
        log(`[agent] model ${models[i]} busy: HTTP ${res.status} ${msg}; retrying`);
        await wait(BUSY_WAIT_MS * (r + 1));
        res = await send(models[i]);
      }
      if (res.ok) return res;
      const type = await errorType(res);
      last = res;
      const busy = isBusy(res.status, await errorMessage(res));
      if (!(shouldFallBack(res.status, type) || busy) || i === models.length - 1) return res;
      log(`[agent] model ${models[i]} failed: HTTP ${res.status} ${type}; trying ${models[i + 1]}`);
    }
    return last as Response;
  };
}
