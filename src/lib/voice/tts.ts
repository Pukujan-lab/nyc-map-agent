/**
 * Sentence-queued speechSynthesis that does not get truncated. Chrome drops or
 * stalls long utterances (~15 s), speaks nothing useful before voices load, and
 * can GC an utterance mid-speech. So: one short chunk at a time, references
 * kept, pause/resume every 10 s, and a bounded wait for voiceschanged.
 */

/** Split text into sentence-sized chunks of at most ~`max` characters (long sentences split at commas/spaces). */
export const chunkText = (text: string, max = 180): string[] =>
  (text.replace(/\s+/g, " ").match(/[^.!?;:]+[.!?;:]*["')\]]*/g) ?? [])
    .flatMap((s) => s.match(new RegExp(`.{1,${max}}(\\s|$)`, "g")) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

/** The first sentences of an answer (~`max` chars) to say aloud; full detail stays on screen. */
export function spokenSummary(text: string, max = 240): string {
  const plain = text.replace(/[*_#>`|[\]]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  let out = "";
  for (const p of chunkText(plain, max)) {
    if (out && out.length + p.length > max) break;
    out = out ? `${out} ${p}` : p;
  }
  return out.length < plain.length - 5 ? `${out} The details are on screen.` : out;
}

export const pickVoice = (v: SpeechSynthesisVoice[]) =>
  v.find((x) => x.lang === "en-US" && /google|samantha|natural|aria/i.test(x.name)) ?? v.find((x) => x.lang.startsWith("en"));

/** Speaks `text` chunk by chunk. Returns cancel. Callers mark speaking before calling. `onEnd` fires once: after the last chunk, on cancel, or on interruption. */
export function speakQueued(synth: SpeechSynthesis, text: string, onEnd: () => void): () => void {
  const chunks = chunkText(text);
  let done = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const end = () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    onEnd();
  };
  if (!chunks.length) { end(); return end; }
  synth.cancel();
  const go = () => {
    if (done || timer) return;
    const voice = pickVoice(synth.getVoices());
    timer = setInterval(() => { if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); } }, 10_000);
    let i = 0;
    const next = () => {
      if (done) return;
      if (i >= chunks.length) return end();
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      if (voice) u.voice = voice;
      u.rate = 1.02;
      u.onend = next;
      u.onerror = (e) => (/interr|cancel/.test(e.error) ? end() : next());
      // Held globally: Chrome can GC an utterance mid-speech and never fire onend.
      (globalThis as { _tts?: unknown })._tts = u;
      synth.speak(u);
    };
    next();
  };
  if (synth.getVoices().length) go();
  else {
    synth.addEventListener?.("voiceschanged", go, { once: true });
    setTimeout(go, 1500);
  }
  return () => { synth.cancel(); end(); };
}
