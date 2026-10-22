import { useEffect } from "react";

export interface HandsFreeState {
  on: boolean;
  supported: boolean;
  listening: boolean;
  busy: boolean;
  speaking: boolean;
}

/** Listen again only when hands-free is on and nothing else is happening; the mic is never open while the app speaks. */
export function shouldListen(s: HandsFreeState): boolean {
  return s.on && s.supported && !s.listening && !s.busy && !s.speaking;
}

/** Errors that mean the mic will not work, so hands-free turns itself off instead of retrying. */
export const FATAL_MIC = /blocked|no microphone|could not start|isn't available/i;

/**
 * Hands-free loop: listen → send → speak → listen. It only runs after the user
 * taps the toggle on. Transcripts go straight to `send`; nothing is stored or logged here.
 */
export function useHandsFree(s: HandsFreeState & { error: string | null; start: () => void; stop: () => void; turnOff: () => void }) {
  const listen = shouldListen(s);
  const { start, stop, turnOff, error, on, speaking, listening } = s;
  useEffect(() => {
    if (!listen) return;
    // A short gap so the tail of the spoken answer is not picked up.
    const t = window.setTimeout(start, 250);
    return () => window.clearTimeout(t);
  }, [listen, start]);
  useEffect(() => {
    if (on && speaking && listening) stop();
  }, [on, speaking, listening, stop]);
  useEffect(() => {
    if (on && error && FATAL_MIC.test(error)) turnOff();
  }, [on, error, turnOff]);
}
