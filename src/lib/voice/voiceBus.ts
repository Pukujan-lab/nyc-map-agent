import { useSyncExternalStore } from "react";

/**
 * Tiny shared voice state between the top bar's Voice button (main chunk) and
 * the lazy agent overlay, which owns the microphone. No audio passes through.
 */
interface VoiceState { listening: boolean; handsFree: boolean; available: boolean }
let state: VoiceState = { listening: false, handsFree: false, available: false };
const subs = new Set<() => void>();
const toggles = new Set<() => void>();

export function setVoiceState(patch: Partial<VoiceState>): void {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export function useVoiceState(): VoiceState {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state);
}
/** The overlay registers what a Voice tap does (start or stop listening). */
export function onVoiceToggle(fn: () => void): () => void {
  toggles.add(fn);
  return () => toggles.delete(fn);
}
export function toggleVoice(): void {
  toggles.forEach((f) => f());
}
