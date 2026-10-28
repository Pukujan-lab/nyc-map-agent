import { useSyncExternalStore } from "react";

/**
 * The one left column on wide screens (owner, 2026-10-28: one sheet, like Google
 * and Apple Maps). The ask box sits at its foot, the open answer above it, and a
 * map card (a restroom, a place) at its top, in `slot`. AgentHome draws the
 * column and owns the slot; MapPanel says whether a card is up and puts it there.
 */
interface LeftColumn {
  /** Where a card goes, while the column is drawn. */
  slot: HTMLElement | null;
  /** A map card is up and wants the column. */
  card: boolean;
  /** An answer (or the voice orb) is open in the column. */
  answer: boolean;
}

let state: LeftColumn = { slot: null, card: false, answer: false };
const subs = new Set<() => void>();

function set(next: Partial<LeftColumn>) {
  if (Object.entries(next).every(([k, v]) => state[k as keyof LeftColumn] === v)) return;
  state = { ...state, ...next };
  subs.forEach((f) => f());
}

export const setLeftSlot = (slot: HTMLElement | null) => set({ slot });
export const setLeftCard = (card: boolean) => set({ card });
export const setLeftAnswer = (answer: boolean) => set({ answer });

export function useLeftColumn<T>(pick: (s: LeftColumn) => T): T {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => pick(state), () => pick(state));
}
