import { useEffect, useRef } from "react";

type Rec = {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
};

/** "Hey map" in each app language, so the phrase works with a non-English recognizer too. */
export const WAKE = /(?:\bhey,? map\b|\boye,? mapa\b|\bh[eé]+,? (?:la )?carte\b|\bh[eé]+,? kat\b|\bэй,? карта|嘿[，,]?\s*地图|헤이[,]?\s*맵|হেই,?\s*ম্যাপ)[,，.!。！]?\s*/i;

/** Strip the wake phrase; null when the phrase is absent. */
export function afterWake(text: string): string | null {
  const m = WAKE.exec(text);
  return m ? text.slice(m.index + m[0].length).trim() : null;
}

/**
 * Optional "Hey map": a continuous Web Speech recognizer that only reacts to
 * finals containing the phrase. Off unless enabled; paused while `paused`.
 * `lang` is the recognizer's language (the app language's speech tag).
 */
export function useWakePhrase(enabled: boolean, paused: boolean, onCommand: (text: string) => void, lang = "en-US") {
  const cb = useRef(onCommand);
  cb.current = onCommand;
  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!enabled || paused || !Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = lang;
    let alive = true;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r.isFinal) continue;
        const rest = afterWake(r[0].transcript);
        if (rest) cb.current(rest);
      }
    };
    rec.onend = () => { if (alive) try { rec.start(); } catch { /* already started */ } };
    try { rec.start(); } catch { /* mic denied */ }
    return () => { alive = false; rec.onend = null; rec.stop(); };
  }, [enabled, paused, lang]);
}
