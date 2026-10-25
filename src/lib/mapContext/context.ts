import { useSyncExternalStore } from "react";

/**
 * What the user is doing right now, so the map can show only what matters
 * for it (PROJECT.md: clean by default, landmarks always). Set by small
 * adapters over existing state; nothing here imports a feature.
 */
export type MapContext =
  | { kind: "browsing" }
  | { kind: "following"; system: "subway" | "bus" | "rail"; route: string | null }
  | { kind: "trip" }
  | { kind: "walking" }
  | { kind: "place" }
  | { kind: "agent" };

export interface ContextInputs {
  /** The follow store's vehicle key, e.g. "subway:138100_F..N20R" or "bus:7421". */
  followedKey: string | null;
  /** That vehicle's route, read off the map once it is drawn. */
  followedRoute: string | null;
  walking: boolean;
  /** The open panel's content id, e.g. "restroom:…" or "agent:trip:…". */
  panelId: string | null;
  chatOpen: boolean;
  /** The subway line picked on the agent-first home (#370), shown like riding it. */
  selectedLine?: string | null;
}

const PLACE_PANEL = /^(restroom|place-toilet|landmark|school|directory|place|poi|storefront):/;

/** The one context the inputs describe. Most specific wins: follow, trip, walk, place, agent. Pure. */
export function pickContext(i: ContextInputs): MapContext {
  if (i.followedKey) {
    const sys = i.followedKey.split(":")[0];
    const system = sys === "bus" ? "bus" : sys === "subway" ? "subway" : "rail";
    return { kind: "following", system, route: i.followedRoute };
  }
  if (i.panelId?.startsWith("agent:trip:")) return { kind: "trip" };
  if (i.selectedLine) return { kind: "following", system: "subway", route: i.selectedLine };
  if (i.walking) return { kind: "walking" };
  if (i.panelId && PLACE_PANEL.test(i.panelId)) return { kind: "place" };
  if (i.chatOpen) return { kind: "agent" };
  return { kind: "browsing" };
}

/** Stable identity of a context: a new one re-arms the clean map after "Show everything". */
export function contextKey(c: MapContext): string {
  return c.kind === "following" ? `following:${c.system}:${c.route ?? ""}` : c.kind;
}

interface State {
  context: MapContext;
  /** "Show everything" was tapped for this context. */
  showAll: boolean;
}

let state: State = { context: { kind: "browsing" }, showAll: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setMapContext(next: MapContext): void {
  if (contextKey(next) === contextKey(state.context)) return;
  state = { context: next, showAll: false };
  emit();
}

export function setShowAll(on: boolean): void {
  if (state.showAll === on) return;
  state = { ...state, showAll: on };
  emit();
}

export function getMapContextState(): State {
  return state;
}

export function useMapContextState(): State {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state, () => state);
}
