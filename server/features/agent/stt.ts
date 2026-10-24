/**
 * POST /api/stt: speech-to-text for browsers without a working built-in
 * recognizer (Brave blocks Chrome's speech service, Firefox has none). The
 * browser records one short turn and posts it here; we pass it to Whisper on
 * Groq and return the text. The audio is not stored or logged. GROQ_API_KEY is
 * read here only and never sent to the client; without it this answers 503
 * and the app says voice isn't available.
 */
import { clientIp } from "../../lib/clientIp";
import { createLimiter } from "./fair-use";

const BASE = "https://api.groq.com/openai/v1";
const MODEL = "whisper-large-v3-turbo";
const sttConfig = () => ({
  key: process.env.STT_API_KEY || process.env.GROQ_API_KEY || "",
  url: `${(process.env.STT_BASE_URL || BASE).replace(/\/$/, "")}/audio/transcriptions`,
  model: process.env.STT_MODEL || MODEL,
});
/** About a minute of compressed speech; a voice turn is a few seconds. */
export const MAX_BYTES = 2_000_000;
const limiter = createLimiter({ windowMax: 120, windowMs: 3_600_000, burstMax: 12, burstMs: 60_000 });

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** "es-US" -> "es"; Whisper wants an ISO-639-1 code. Pure, for tests. */
export function whisperLang(tag: string | null): string | null {
  const two = (tag ?? "").trim().slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(two) ? two : null;
}

export async function transcribe(form: FormData, headers: Headers, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const { key, url, model } = sttConfig();
  if (!key) return json({ error: "stt_unavailable" }, 503);
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return json({ error: "invalid_query", issues: ["audio: a recording is required"] }, 400);
  if (audio.size > MAX_BYTES) return json({ error: "invalid_query", issues: ["audio: too long"] }, 413);
  const limit = limiter.take(clientIp(headers));
  if (!limit.ok) return json({ error: "rate_limited" }, 429);
  const out = new FormData();
  out.set("file", audio, typeof (audio as File).name === "string" ? (audio as File).name : "speech.webm");
  out.set("model", model);
  out.set("response_format", "json");
  const lang = whisperLang(typeof form.get("lang") === "string" ? (form.get("lang") as string) : null);
  if (lang) out.set("language", lang);
  try {
    const r = await fetchImpl(url, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: out, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return json({ error: "stt_failed" }, 502);
    const d = (await r.json()) as { text?: string };
    return json({ text: (d.text ?? "").trim() });
  } catch {
    return json({ error: "stt_failed" }, 502);
  }
}
