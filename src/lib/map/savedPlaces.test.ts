import { describe, expect, it } from "vitest";
import { clearSavedPlace, readSavedPlaces, saveSavedPlace, SAVED_PLACES_KEY } from "./savedPlaces";
import { spotAt, spotPillLabel } from "./savedSpot";

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
}

describe("save-button helpers", () => {
  it("labels a spot by neighbourhood, falling back to Home or Work", () => {
    expect(spotAt("home", -73.9, 40.7, "Astoria").label).toBe("Astoria");
    expect(spotAt("work", -73.9, 40.7, "New York").label).toBe("Work");
    expect(spotAt("home", -73.9, 40.7, null).label).toBe("Home");
    expect(spotAt("work", -73.9, 40.7, "My location")).toEqual({ label: "My location", lon: -73.9, lat: 40.7 });
  });
  it("shows the pill as the title alone or with the place", () => {
    expect(spotPillLabel("home", { label: "Home", lon: -73.9, lat: 40.7 })).toBe("Home");
    expect(spotPillLabel("work", { label: "Midtown", lon: -73.98, lat: 40.75 })).toBe("Work · Midtown");
  });
  it("stores a button-built spot, and refuses one off the map", () => {
    const storage = memory();
    saveSavedPlace("home", spotAt("home", -73.92, 40.76, "Astoria"), storage);
    expect(readSavedPlaces(storage).home?.label).toBe("Astoria");
    expect(saveSavedPlace("work", spotAt("work", 0, 0), storage).work).toBeNull();
  });
});

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
