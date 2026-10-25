import { useSyncExternalStore } from "react";

/**
 * Voice settings on the agent-first home (#370): "Speak answers" and "Listen
 * for Hey map", set from the Settings menu and read by the agent overlay.
 * Kept in memory for this tab, like the classic assistant's own toggles.
 */
interface VoicePrefs {
  speak: boolean;
  wake: boolean;
}

let prefs: VoicePrefs = { speak: true, wake: false };
const subs = new Set<() => void>();

export function setVoicePrefs(patch: Partial<VoicePrefs>): void {
  prefs = { ...prefs, ...patch };
  subs.forEach((f) => f());
}

export function useVoicePrefs(): VoicePrefs {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => prefs, () => prefs);
}
