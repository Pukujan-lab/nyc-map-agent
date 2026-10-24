/**
 * POST /api/agent — the smart-mode agent. InferHub (OpenAI-compatible) through
 * the AI SDK as a library: tool calling + streaming. Streams NDJSON
 * StreamEvent lines (src/features/agent/schema.ts). INFERHUB_API_KEY is read
 * here only and never sent to the client.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { stepCountIs, streamText, type LanguageModel } from "ai";
import { requestBody, type StreamEvent } from "../../../src/features/agent/schema";
import { resolveFlags } from "../../../src/lib/flags/registry";
import { makeTools, type ToolContext } from "./tools";
import { toNyLocal } from "./trip";
import { fallbackFetch, modelChain } from "./model-fallback";
import { clientIp } from "../../lib/clientIp";
import { budgetConfigFromEnv, createDailyBudget, createLimiter, limitConfigFromEnv, limitedResponse, noModelMessage } from "./fair-use";
import { ActionCollector } from "./mapActions";
import { contextLine, systemPrompt } from "./prompt";
import { AnswerAudit } from "./audit";

export const INFERHUB_BASE_URL = process.env.INFERHUB_BASE_URL ?? "https://api.inferhub.dev/v1";
/** Cheap, fast, good at tool calls: ~$0.075 in / $0.30 out per M tokens (InferHub market max ask). */
export const DEFAULT_MODEL = "cb/deepseek-v4.1-flash";

// The prompt lives in prompt.ts; re-exported for existing importers.
export { contextLine, systemPrompt } from "./prompt";

function defaultModel(only?: string): LanguageModel {
  const key = process.env.INFERHUB_API_KEY;
  if (!key) throw new Error("INFERHUB_API_KEY is not set on the server.");
  // Over the daily cap only the configured cheap model is tried, with no fallbacks to pricier ones.
  const models = only ? [only] : modelChain(process.env.INFERHUB_MODEL ?? DEFAULT_MODEL, process.env.INFERHUB_MODEL_FALLBACKS);
  return createOpenAICompatible({ name: "inferhub", baseURL: INFERHUB_BASE_URL, apiKey: key, fetch: fallbackFetch(models) })(models[0]);
}

export type FairUse = { limiter: ReturnType<typeof createLimiter>; budget: ReturnType<typeof createDailyBudget>; now: () => number };

/** In-memory, per process (see fair-use.ts): one Node process serves the deployment. Created on first use so env is read at runtime. */
let shared: FairUse | undefined;
const sharedFairUse = (): FairUse =>
  (shared ??= { limiter: createLimiter(limitConfigFromEnv()), budget: createDailyBudget(budgetConfigFromEnv()), now: Date.now });

export async function POST(request: Request, opts: { model?: LanguageModel; deps?: ToolContext["deps"]; fairUse?: FairUse } = {}): Promise<Response> {
  const parsed = requestBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  // Only well-formed questions count. The client sends no device id, so the key is the address alone.
  const fair = opts.fairUse ?? sharedFairUse();
  const limit = fair.limiter.take(`ip:${clientIp(request.headers)}`);
  if (!limit.ok) return limitedResponse(limit.retryAt, limit.reason, fair.now());
  const budget = fair.budget.tier();
  const { messages, now, mode, context } = parsed.data;
  // Street view's spot counts as the shared location for "here".
  const location = parsed.data.location ?? (context ? { lon: context.lon, lat: context.lat } : null);
  const enc = new TextEncoder();
  const modelId = budget.tier === "cheap" ? budget.model : budget.tier === "none" ? "none" : (process.env.INFERHUB_MODEL ?? DEFAULT_MODEL);

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      if (budget.tier === "none") {
        // Daily budget spent: answer without a model call so the chat still says something useful.
        send({ type: "text", text: noModelMessage(budget.resetAt) });
        send({ type: "done", model: modelId, usage: { inputTokens: 0, outputTokens: 0 } });
        controller.close();
        return;
      }
      // Buttons under the answer, from the tool results (#371); one "actions" line before "done".
      const actions = new ActionCollector();
      const flushActions = () => {
        const list = actions.list();
        if (list.length) send({ type: "actions", actions: list });
      };
      const nowLocal = toNyLocal(now ? new Date(now) : new Date());
      // Data sources and their age, plus the "no guessing" check (#375); one "sources" line before "done".
      const audit = new AnswerAudit([nowLocal, contextLine(context) ?? "", ...messages.filter((m) => m.role === "user").map((m) => m.content)]);
      try {
        const model = opts.model ?? defaultModel(budget.tier === "cheap" ? budget.model : undefined);
        const result = streamText({
          model,
          system: systemPrompt(nowLocal, location, mode, context),
          messages,
          tools: makeTools({ location, emit: (command) => send({ type: "command", command }), actions: (a) => actions.add(a), sources: audit.ledger, deps: opts.deps, drive: resolveFlags({ env: process.env.VITE_FLAGS, advancedMode: false }).agentDrive }),
          stopWhen: stepCountIs(8),
          maxRetries: 1,
          // The default handler console.logs the raw provider error; keep logs to the request id only.
          onError: ({ error }) => {
            const e = error as { responseHeaders?: Record<string, string>; statusCode?: number; message?: string };
            const id = e.responseHeaders?.["x-inferhub-request-id"];
            // Status and the provider's own message say why (busy market, price limit, bad model); the key and request never appear in either.
            const why = [e.statusCode ? `HTTP ${e.statusCode}` : null, typeof e.message === "string" ? e.message.replace(/\b(sk|ih|Bearer)[-_ ]?[\w.-]{8,}/gi, "[redacted]").slice(0, 160) : null].filter(Boolean).join(" ");
            console.warn(`[agent] model call failed${why ? `: ${why}` : ""}${id ? ` (x-inferhub-request-id ${id})` : ""}`);
          },
        });
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") { audit.text(part.text); send({ type: "text", text: part.text }); }
          else if (part.type === "tool-call") send({ type: "tool", name: part.toolName });
          else if (part.type === "tool-result") audit.toolResult(part.toolName, part.output);
          else if (part.type === "error") send({ type: "error", message: "The model call failed." });
          else if (part.type === "finish") {
            fair.budget.record((part.totalUsage.inputTokens ?? 0) + (part.totalUsage.outputTokens ?? 0));
            flushActions();
            const sources = audit.event();
            if (sources) send(sources);
            send({ type: "done", model: modelId, usage: { inputTokens: part.totalUsage.inputTokens ?? 0, outputTokens: part.totalUsage.outputTokens ?? 0 } });
          }
        }
      } catch (err) {
        // Never echo provider errors verbatim: they can include request headers.
        send({ type: "error", message: err instanceof Error && /INFERHUB_API_KEY/.test(err.message) ? err.message : "The assistant is unavailable right now." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
