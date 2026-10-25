import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_BYTES, transcribe, whisperLang } from "./stt";

const form = (bytes: number, lang?: string) => {
  const f = new FormData();
  f.set("audio", new Blob([new Uint8Array(bytes)], { type: "audio/webm" }), "turn.webm");
  if (lang) f.set("lang", lang);
  return f;
};

describe("server speech-to-text", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("is unavailable without a key, so the app can say voice is off", async () => {
    vi.stubEnv("GROQ_API_KEY", ""); vi.stubEnv("STT_API_KEY", "");
    expect((await transcribe(form(10), new Headers())).status).toBe(503);
  });

  it("rejects empty and over-long recordings", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    expect((await transcribe(new FormData(), new Headers())).status).toBe(400);
    expect((await transcribe(form(MAX_BYTES + 1), new Headers())).status).toBe(413);
  });

  it("sends the clip to Whisper with the language and returns the text", async () => {
    vi.stubEnv("GROQ_API_KEY", "k");
    let sent: FormData | null = null;
    const fake = ((_url: string, init: RequestInit) => { sent = init.body as FormData; return Promise.resolve(Response.json({ text: " Where is the nearest restroom? " })); }) as unknown as typeof fetch;
    const r = await transcribe(form(100, "es-US"), new Headers({ "cf-connecting-ip": "203.0.113.7" }), fake);
    expect(await r.json()).toEqual({ text: "Where is the nearest restroom?" });
    expect(sent!.get("language")).toBe("es");
    expect(sent!.get("model")).toBe("whisper-large-v3-turbo");
  });

  it("maps a browser language to Whisper's two-letter code", () => {
    expect(whisperLang("zh-CN")).toBe("zh");
    expect(whisperLang("")).toBeNull();
  });
});
