import { useSyncExternalStore } from "react";
import { asSavedSpot, type SavedSpot } from "./savedSpot";

/** Home and work, saved on this phone. Separate from the basemap place-category list. */
export interface SavedPlaces {
  home: SavedSpot | null;
  work: SavedSpot | null;
}

export const SAVED_PLACES_KEY = "nma.homeWork";
const EMPTY: SavedPlaces = { home: null, work: null };

export function readSavedPlaces(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): SavedPlaces {
  try {
    const raw = JSON.parse(storage?.getItem(SAVED_PLACES_KEY) ?? "{}") as { home?: unknown; work?: unknown };
    return { home: asSavedSpot(raw.home), work: asSavedSpot(raw.work) };
  } catch {
    return EMPTY;
  }
}

let places = readSavedPlaces();
const listeners = new Set<() => void>();

function publish(next: SavedPlaces, storage: Pick<Storage, "setItem" | "removeItem">): void {
  try {
    if (next.home || next.work) storage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
    else storage.removeItem(SAVED_PLACES_KEY);
  } catch {
    /* private mode */
  }
  if (storage === globalThis.localStorage) {
    places = next;
    listeners.forEach((l) => l());
  }
}

export function saveSavedPlace(
  kind: "home" | "work",
  spot: SavedSpot,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = globalThis.localStorage,
): SavedPlaces {
  const clean = asSavedSpot(spot);
  if (!clean) return readSavedPlaces(storage);
  const next = { ...readSavedPlaces(storage), [kind]: clean };
  publish(next, storage);
  return next;
}

export function clearSavedPlace(
  kind: "home" | "work",
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = globalThis.localStorage,
): SavedPlaces {
  const next = { ...readSavedPlaces(storage), [kind]: null };
  publish(next, storage);
  return next;
}

export function useSavedPlaces(): SavedPlaces {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => places, () => places);
}
