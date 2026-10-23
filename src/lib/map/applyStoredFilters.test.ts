import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  setOptions: vi.fn(),
  setPlaces: vi.fn(),
  setQuickLayer: vi.fn(),
  setTransitFocus: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock("./mapOptions", async (orig) => ({ ...(await orig<typeof import("./mapOptions")>()), setOptions: m.setOptions }));
vi.mock("./places", async (orig) => ({ ...(await orig<typeof import("./places")>()), setPlaces: m.setPlaces }));
vi.mock("../quickLayers", () => ({ setQuickLayer: m.setQuickLayer }));
vi.mock("./transitFocus", () => ({ setTransitFocus: m.setTransitFocus }));
vi.mock("../theme", () => ({ setTheme: m.setTheme }));

import { applyStoredFilters } from "./mapFilters";

beforeEach(() => vi.clearAllMocks());

describe("applyStoredFilters", () => {
  it("does nothing for an empty patch or one that only touches the URL", () => {
    applyStoredFilters({});
    applyStoredFilters({ restrooms: true, eco: false, parking: true, liveTrains: false });
    for (const fn of Object.values(m)) expect(fn).not.toHaveBeenCalled();
  });
  it("sends only the option fields that were given, keeping explicit false", () => {
    applyStoredFilters({ roads: false, buildings: "3d", busStops: false });
    expect(m.setOptions).toHaveBeenCalledTimes(1);
    expect(m.setOptions).toHaveBeenCalledWith({ roads: false, buildings: "3d", busStops: false });
  });
  it("drops unknown subway lines but keeps an empty list (show every line)", () => {
    applyStoredFilters({ routes: ["L", "ZZ", "7"] });
    expect(m.setOptions).toHaveBeenLastCalledWith({ routes: ["L", "7"] });
    applyStoredFilters({ routes: [] });
    expect(m.setOptions).toHaveBeenLastCalledWith({ routes: [] });
  });
  it("keeps only known place ids and switches on their quick layers", () => {
    applyStoredFilters({ places: ["food.bar", "parks.dog", "nope.nothing"] });
    const set = m.setPlaces.mock.calls[0][0] as Set<string>;
    expect([...set].sort()).toEqual(["food.bar", "parks.dog"]);
    expect(m.setQuickLayer).toHaveBeenCalledWith("businesses", true);
    expect(m.setQuickLayer).toHaveBeenCalledWith("parksPlaces", true);
    expect(m.setQuickLayer).toHaveBeenCalledTimes(2);
  });
  it("hides all places for an empty list without touching quick layers", () => {
    applyStoredFilters({ places: [] });
    expect([...(m.setPlaces.mock.calls[0][0] as Set<string>)]).toEqual([]);
    expect(m.setQuickLayer).not.toHaveBeenCalled();
  });
  it("sets each quick layer, theme and transit focus, including false", () => {
    applyStoredFilters({ xray: false, streetArt: true, citibike: true, transitFocus: false, theme: "ink" });
    expect(m.setQuickLayer).toHaveBeenCalledWith("xray", false);
    expect(m.setQuickLayer).toHaveBeenCalledWith("streetArt", true);
    expect(m.setQuickLayer).toHaveBeenCalledWith("citibike", true);
    expect(m.setTransitFocus).toHaveBeenCalledWith(false);
    expect(m.setTheme).toHaveBeenCalledWith("ink");
  });
});
