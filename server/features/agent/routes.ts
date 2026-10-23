/**
 * POST /api/agent — the smart-mode agent. InferHub (OpenAI-compatible) through
 * the AI SDK as a library: tool calling + streaming. Streams NDJSON
 * StreamEvent lines (src/features/agent/schema.ts). INFERHUB_API_KEY is read
 * here only and never sent to the client.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { stepCountIs, streamText, type LanguageModel } from "ai";
import { requestBody, type AskContext, type StreamEvent } from "../../../src/features/agent/schema";
import { resolveFlags } from "../../../src/lib/flags/registry";
import { makeTools, type ToolContext } from "./tools";
import { toNyLocal } from "./trip";
import { fallbackFetch, modelChain } from "./model-fallback";

export const INFERHUB_BASE_URL = process.env.INFERHUB_BASE_URL ?? "https://api.inferhub.dev/v1";
/** Cheap, fast, good at tool calls: ~$0.075 in / $0.30 out per M tokens (InferHub market max ask). */
export const DEFAULT_MODEL = "cb/deepseek-v4.1-flash";

/**
 * The exact shared position goes to the model so "from here" directions start
 * at the right corner. It is used for this request only: the server never
 * logs it, writes it to Octo or R2, or keeps it after the response ends.
 */
export function contextLine(c: AskContext | undefined): string | null {
  if (!c) return null;
  const parts = [`The user is in street view at longitude ${c.lon}, latitude ${c.lat}`];
  if (c.heading !== null) parts.push(`facing ${c.heading} degrees`);
  if (c.nearestStation) parts.push(`nearest station ${c.nearestStation}`);
  if (c.nearestEntrance) parts.push(`nearest entrance ${c.nearestEntrance}`);
  if (c.followedTrain) parts.push(`following train ${c.followedTrain}`);
  return `${parts.join("; ")}. Treat "here" as that spot unless they say otherwise.`;
}

export function systemPrompt(nowLocal: string, location: { lon: number; lat: number } | null, mode: "walk" | "transit" | "drive" = "transit", context?: AskContext): string {
  const street = contextLine(context);
  return [
    ...(street ? [street] : []),
    "You are the NYC Map's trip assistant. Answers are spoken aloud: 2-4 short sentences, no markdown, no lists.",
    `Now is ${nowLocal} in New York. Resolve relative times ("tomorrow at 9am") to local New York time YYYY-MM-DDTHH:MM.`,
    location
      ? `The user shared their exact location: longitude ${location.lon}, latitude ${location.lat}. Use "here" for it in tools; do not repeat the coordinates back.`
      : 'The user\'s location is unknown. If they say "here" or need a start point, tell them to tap Use my location under your reply, or to type a starting address. That button is already on screen.',
    `The user's mode chip is ${mode}: use drive_plan for drive, route_walk for walk, transit_plan for transit, unless they ask otherwise.`,
    "For a drive: call drive_plan, then showRoute, openPanel, playFlythrough; answer with ETA, slow segments, closures, tolls and only the parking hints the tool returned.",
    "For a trip question: call transit_plan, then showRoute, openPanel and playFlythrough with its tripId (speed 10), then answer with: the recommended itinerary (the first one; it arrives earliest) and how it compares with the alternatives in plain words (e.g. \"The Q53 SBS is 20 minutes faster than the subway\"), lines, ETA, weather at that time, any planned work, the recommended exit said plainly (e.g. \"Use the NE exit near East 42nd Street & Lexington Avenue\"), and elevator outages.",
    'For "arrive by" questions set arriveBy true on transit_plan; otherwise the time is a departure time.',
    "Spell street names out in full: Street, Avenue, Boulevard, Place, East/West (\"West 44th Street\", \"St. Marks Place\"), never St/Av abbreviations. Keep station names exactly as the MTA writes them (\"Times Sq-42 St\").",
    "Never advise which train car to board; that data is not available. Do not invent service information that tools did not return.",
  ].join("\n");
}

function defaultModel(): LanguageModel {
  const key = process.env.INFERHUB_API_KEY;
  if (!key) throw new Error("INFERHUB_API_KEY is not set on the server.");
  const models = modelChain(process.env.INFERHUB_MODEL ?? DEFAULT_MODEL, process.env.INFERHUB_MODEL_FALLBACKS);
  return createOpenAICompatible({ name: "inferhub", baseURL: INFERHUB_BASE_URL, apiKey: key, fetch: fallbackFetch(models) })(models[0]);
}

export async function POST(request: Request, opts: { model?: LanguageModel; deps?: ToolContext["deps"] } = {}): Promise<Response> {
  const parsed = requestBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { messages, now, mode, context } = parsed.data;
  // Street view's spot counts as the shared location for "here".
  const location = parsed.data.location ?? (context ? { lon: context.lon, lat: context.lat } : null);
  const enc = new TextEncoder();
  const modelId = process.env.INFERHUB_MODEL ?? DEFAULT_MODEL;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      try {
        const model = opts.model ?? defaultModel();
        const result = streamText({
          model,
          system: systemPrompt(toNyLocal(now ? new Date(now) : new Date()), location, mode, context),
          messages,
          tools: makeTools({ location, emit: (command) => send({ type: "command", command }), deps: opts.deps, drive: resolveFlags({ env: process.env.VITE_FLAGS, advancedMode: false }).agentDrive }),
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
          if (part.type === "text-delta") send({ type: "text", text: part.text });
          else if (part.type === "tool-call") send({ type: "tool", name: part.toolName });
          else if (part.type === "error") send({ type: "error", message: "The model call failed." });
          else if (part.type === "finish") {
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
