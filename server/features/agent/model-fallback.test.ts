import { describe, expect, it, vi } from "vitest";
import { errorMessage, errorType, fallbackFetch, isBusy, modelChain, shouldFallBack } from "./model-fallback";
import { DEFAULT_MODEL } from "./routes";

const err = (status: number, code: string) => new Response(JSON.stringify({ error: { message: "x", type: "invalid_request_error", code } }), { status });
const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const req = (model = "cb/a") => ({ method: "POST", headers: { authorization: "Bearer sk-secret" }, body: JSON.stringify({ model, messages: [] }) });
const modelsSent = (f: ReturnType<typeof vi.fn>): string[] => f.mock.calls.map((c) => (JSON.parse((c[1] as RequestInit).body as string) as { model: string }).model);

describe("model fallback", () => {
  it("defaults to the cb/ route", () => expect(DEFAULT_MODEL).toBe("cb/deepseek-v4.1-flash"));

  it("builds a de-duplicated chain from the comma list", () => {
    expect(modelChain("cb/a", " cb/b, ,cb/a,cb/c ")).toEqual(["cb/a", "cb/b", "cb/c"]);
    expect(modelChain("cb/a", undefined)).toEqual(["cb/a"]);
  });

  it("decides when to fall back", () => {
    expect(shouldFallBack(404, "model_not_found")).toBe(true);
    expect(shouldFallBack(400, "model_not_found")).toBe(true);
    expect(shouldFallBack(402, "insufficient_quota")).toBe(true);
    expect(shouldFallBack(503, "unknown")).toBe(true);
    expect(shouldFallBack(400, "context_length_exceeded")).toBe(false);
    expect(shouldFallBack(401, "invalid_api_key")).toBe(false);
  });

  it("reads the provider error type", async () => {
    expect(await errorType(err(404, "model_not_found"))).toBe("model_not_found");
    expect(await errorType(new Response("not json", { status: 500 }))).toBe("unknown");
  });

  it("tries fallbacks in order on 404 model_not_found, 402 and 5xx", async () => {
    const base = vi.fn().mockResolvedValueOnce(err(404, "model_not_found")).mockResolvedValueOnce(err(402, "payment_required")).mockResolvedValueOnce(new Response("", { status: 502 })).mockResolvedValueOnce(ok());
    const log = vi.fn();
    const res = await fallbackFetch(["cb/a", "cb/b", "cb/c", "cb/d"], base as unknown as typeof fetch, log)("https://x/chat", req());
    expect(res.status).toBe(200);
    expect(modelsSent(base)).toEqual(["cb/a", "cb/b", "cb/c", "cb/d"]);
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls[0][0]).toContain("model_not_found");
    for (const [m] of log.mock.calls) expect(m).not.toContain("sk-secret");
  });

  it("does not fall back on other 4xx and returns the last failure when exhausted", async () => {
    const base = vi.fn().mockResolvedValue(err(400, "context_length_exceeded"));
    expect((await fallbackFetch(["cb/a", "cb/b"], base as unknown as typeof fetch, vi.fn())("u", req())).status).toBe(400);
    expect(base).toHaveBeenCalledTimes(1);
    const base2 = vi.fn().mockResolvedValue(err(402, "payment_required"));
    expect((await fallbackFetch(["cb/a", "cb/b"], base2 as unknown as typeof fetch, vi.fn())("u", req())).status).toBe(402);
    expect(modelsSent(base2)).toEqual(["cb/a", "cb/b"]);
  });

  it("passes through when there is a single model", async () => {
    const base = vi.fn().mockResolvedValue(ok());
    await fallbackFetch(["cb/a"], base as unknown as typeof fetch, vi.fn())("u", req());
    expect(base).toHaveBeenCalledTimes(1);
  });

  const busy = (status = 503) => new Response(JSON.stringify({ error: "every provider within your price limit is busy or rate-limited right now; 199 provider(s) priced above your limit are available" }), { status });
  const instant = () => Promise.resolve();

  it("recognises InferHub's busy market, by message or by 429", async () => {
    expect(isBusy(503, "every provider within your price limit is busy or rate-limited right now")).toBe(true);
    expect(isBusy(429, "")).toBe(true);
    expect(isBusy(400, "context_length_exceeded")).toBe(false);
    expect(await errorMessage(busy())).toContain("busy or rate-limited");
    expect(await errorMessage(new Response("not json"))).toBe("");
  });

  it("retries the same model when the market is busy, even with a single model", async () => {
    const base = vi.fn().mockResolvedValueOnce(busy(400)).mockResolvedValueOnce(busy(400)).mockResolvedValueOnce(ok());
    const log = vi.fn();
    const res = await fallbackFetch(["cb/a"], base as unknown as typeof fetch, log, instant)("u", req());
    expect(res.status).toBe(200);
    expect(modelsSent(base)).toEqual(["cb/a", "cb/a", "cb/a"]);
    expect(log.mock.calls[0][0]).toContain("busy");
  });

  it("gives up after two busy retries, then tries the next model", async () => {
    const base = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok());
    const res = await fallbackFetch(["cb/a", "cb/b"], base as unknown as typeof fetch, vi.fn(), instant)("u", req());
    expect(res.status).toBe(200);
    expect(modelsSent(base)).toEqual(["cb/a", "cb/a", "cb/a", "cb/b"]);
  });

  it("does not retry a plain 401", async () => {
    const base = vi.fn().mockResolvedValue(err(401, "invalid_api_key"));
    expect((await fallbackFetch(["cb/a"], base as unknown as typeof fetch, vi.fn(), instant)("u", req())).status).toBe(401);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
