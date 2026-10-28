import { useLayoutEffect, useSyncExternalStore } from "react";

/**
 * The one left column on wide screens (owner, 2026-10-28: one sheet, like Google
 * and Apple Maps). The ask box sits at its foot, the open answer above it, and a
 * card (a restroom, a line, a station's exits) at its top, in `slot`. AgentHome
 * draws the column and owns the slot; each card says it is up with useLeftCard.
 *
 * The cards are a back stack: the newest shows, and closing it brings back the
 * one under it, the way Back works in Google and Apple Maps.
 */
interface LeftColumn {
  /** Where a card goes, while the column is drawn. */
  slot: HTMLElement | null;
  /** The cards that want the column, oldest first; the last one shows. */
  cards: readonly string[];
  /** An answer (or the voice orb) is open in the column. */
  answer: boolean;
}

let state: LeftColumn = { slot: null, cards: [], answer: false };
const subs = new Set<() => void>();

function set(next: Partial<LeftColumn>) {
  if (Object.entries(next).every(([k, v]) => state[k as keyof LeftColumn] === v)) return;
  state = { ...state, ...next };
  subs.forEach((f) => f());
}

export const setLeftSlot = (slot: HTMLElement | null) => set({ slot });
export const setLeftAnswer = (answer: boolean) => set({ answer });

/** Put a card on top of the stack (again, if it was under another). Pure, for tests. */
export function pushCard(cards: readonly string[], id: string): readonly string[] {
  return [...cards.filter((c) => c !== id), id];
}

export function useLeftColumn<T>(pick: (s: LeftColumn) => T): T {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => pick(state), () => pick(state));
}

/**
 * A card that goes in the column while `on`: where to put it (null until the
 * column is drawn) and whether it is the one showing. A new `id` comes to the top.
 */
export function useLeftCard(id: string, on: boolean): { slot: HTMLElement | null; top: boolean } {
  useLayoutEffect(() => {
    if (!on) return;
    set({ cards: pushCard(state.cards, id) });
    return () => set({ cards: state.cards.filter((c) => c !== id) });
  }, [id, on]);
  const slot = useLeftColumn((s) => s.slot);
  const top = useLeftColumn((s) => s.cards.at(-1) === id);
  return { slot: on ? slot : null, top };
}
