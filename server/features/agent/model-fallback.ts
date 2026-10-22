/**
 * InferHub model fallback. The primary model comes from INFERHUB_MODEL (or
 * DEFAULT_MODEL); INFERHUB_MODEL_FALLBACKS is an optional comma-separated list
 * tried in order when a model is missing (4xx model_not_found), unpaid (402)
 * or the provider fails (5xx). Implemented as a fetch wrapper so the AI SDK
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

export function shouldFallBack(status: number, type: string): boolean {
  return status === 402 || status >= 500 || (status >= 400 && status < 500 && /model_not_found|model.not.found|invalid_model/i.test(type));
}

export function fallbackFetch(models: string[], base: typeof fetch = fetch, log: (m: string) => void = console.warn): typeof fetch {
  return async (input, init) => {
    const body = typeof init?.body === "string" ? init.body : null;
    let parsed: Record<string, unknown> | null = null;
    try { parsed = body ? (JSON.parse(body) as Record<string, unknown>) : null; } catch { parsed = null; }
    if (!parsed || typeof parsed.model !== "string" || models.length < 2) return base(input, init);
    let last: Response | undefined;
    for (let i = 0; i < models.length; i++) {
      const res = await base(input, { ...init, body: JSON.stringify({ ...parsed, model: models[i] }) });
      if (res.ok) return res;
      const type = await errorType(res);
      last = res;
      if (!shouldFallBack(res.status, type) || i === models.length - 1) return res;
      log(`[agent] model ${models[i]} failed: HTTP ${res.status} ${type}; trying ${models[i + 1]}`);
    }
    return last as Response;
  };
}
