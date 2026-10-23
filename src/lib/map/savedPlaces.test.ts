import { describe, expect, it } from "vitest";
import { clearSavedPlace, readSavedPlaces, saveSavedPlace, SAVED_PLACES_KEY } from "./savedPlaces";

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
}

describe("saved home and work", () => {
  it("saves a place and forgets one outside the metro", () => {
    const storage = memory();
    saveSavedPlace("home", { label: " Astoria ", lon: -73.92, lat: 40.76 }, storage);
    expect(readSavedPlaces(storage).home).toEqual({ label: "Astoria", lon: -73.92, lat: 40.76 });
    saveSavedPlace("work", { label: "Downtown", lon: -74, lat: 40.71 }, storage);
    expect(readSavedPlaces(storage).work?.label).toBe("Downtown");
    const before = storage.getItem(SAVED_PLACES_KEY);
    saveSavedPlace("home", { label: "Far", lon: 0, lat: 0 }, storage);
    expect(storage.getItem(SAVED_PLACES_KEY)).toBe(before);
    expect(readSavedPlaces(storage).home?.label).toBe("Astoria");
  });
  it("clears one place and drops the key when both are gone", () => {
    const storage = memory();
    saveSavedPlace("home", { label: "Home", lon: -73.99, lat: 40.73 }, storage);
    clearSavedPlace("home", storage);
    expect(storage.getItem(SAVED_PLACES_KEY)).toBeNull();
    expect(readSavedPlaces(storage)).toEqual({ home: null, work: null });
  });
});
