import { describe, expect, it, vi } from "vitest";
import { chunkText, pickVoice, speakQueued, spokenSummary } from "./tts";
import { isSpeech } from "./bargeIn";

describe("chunkText", () => {
  it("splits per sentence and caps chunk length", () => {
    const long = "Take the 1 train uptown, transfer at 72 St, walk two blocks west along a very long avenue that keeps going and going for quite a while past many shops and cafés, then turn right onto the side street.";
    const chunks = chunkText(`Hi there. ${long} Done!`, 80);
    expect(chunks[0]).toBe("Hi there.");
    expect(chunks.at(-1)).toBe("Done!");
    expect(chunks.every((c) => c.length <= 81)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toContain("turn right onto the side street.");
  });
  it("handles empty input", () => expect(chunkText("  ")).toEqual([]));
});

describe("spokenSummary", () => {
  it("keeps short answers whole", () => expect(spokenSummary("Use the stairs at 7 Av.")).toBe("Use the stairs at 7 Av."));
  it("shortens long answers and points to the screen", () => {
    const s = spokenSummary("First sentence here is fairly long and useful. " + "More detail follows. ".repeat(30));
    expect(s.length).toBeLessThan(300);
    expect(s).toMatch(/details are on screen\.$/);
  });
  it("strips markdown", () => expect(spokenSummary("**Take** the [A](http://x) train.")).toBe("Take the A train."));
});

describe("pickVoice", () => {
  it("prefers a natural en-US voice", () => {
    const v = [{ lang: "fr-FR", name: "Amelie" }, { lang: "en-US", name: "Fred" }, { lang: "en-US", name: "Google US English" }] as SpeechSynthesisVoice[];
    expect(pickVoice(v)?.name).toBe("Google US English");
  });
});

describe("speakQueued", () => {
  it("speaks every chunk in order, waits for voices, and ends once", async () => {
    vi.useFakeTimers();
    const said: string[] = [];
    const listeners: Array<() => void> = [];
    let voices: SpeechSynthesisVoice[] = [];
    const synth = {
      speaking: false, paused: false,
      cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(),
      getVoices: () => voices,
      addEventListener: (_: string, f: () => void) => listeners.push(f),
      removeEventListener: () => {},
      speak: (u: { text: string; onend?: () => void }) => { said.push(u.text); setTimeout(() => u.onend?.(), 10); },
    } as unknown as SpeechSynthesis;
    globalThis.SpeechSynthesisUtterance = class { text: string; constructor(t: string) { this.text = t; } } as unknown as typeof SpeechSynthesisUtterance;
    const onEnd = vi.fn();
    speakQueued(synth, "One. Two. Three.", onEnd);
    expect(said).toEqual([]); // voices not loaded yet
    voices = [{ lang: "en-US", name: "Samantha" } as SpeechSynthesisVoice];
    listeners.forEach((f) => f());
    await vi.advanceTimersByTimeAsync(100);
    expect(said).toEqual(["One.", "Two.", "Three."]);
    expect(onEnd).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("cancel stops the queue", async () => {
    const said: string[] = [];
    const synth = { speaking: true, paused: false, cancel: vi.fn(), pause() {}, resume() {}, getVoices: () => [{ lang: "en-US", name: "x" }], speak: (u: { text: string }) => said.push(u.text) } as unknown as SpeechSynthesis;
    const onEnd = vi.fn();
    const cancel = speakQueued(synth, "A. B.", onEnd);
    await Promise.resolve();
    cancel();
    expect(said).toEqual(["A."]);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("barge-in VAD", () => {
  it("accumulates only above the noise floor", () => {
    expect(isSpeech(0.02, 0.01)).toBe(false);
    expect(isSpeech(0.08, 0.01)).toBe(true);
    expect(isSpeech(0.08, 0.05)).toBe(false);
  });
});
