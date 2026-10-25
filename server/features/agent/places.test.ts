import { describe, expect, it, vi } from "vitest";
import { bestCandidate, matchLandmark, matchStation } from "./places";
import { businessQuery, geocode } from "./services";
import type { Station } from "./transit";

const st = (name: string, at: [number, number]): Station => ({ id: name, complexId: name, name, routes: [], structure: "Subway", at });
const stations = [st("Grand Central-42 St", [-73.9768, 40.7518]), st("34 St-Herald Sq", [-73.9879, 40.7496]), st("Atlantic Av-Barclays Ctr", [-73.9776, 40.6842]), st("Bedford Av", [-73.9571, 40.7173])];
const esplanade = { label: "700 ESPLANADE GD PLAZA, Manhattan, New York, NY", at: [-73.936, 40.82] as [number, number], confidence: 0.6 };

describe("geocode landmarks and stations", () => {
  it.each(["Grand Central", "grand central terminal", "Penn Station", "Port Authority", "Times Square", "Union Square", "Barclays Center", "WTC", "the Oculus", "Times Sq"])("%s is a curated landmark", (q) => {
    expect(matchLandmark(q)).not.toBeNull();
  });

  it("matches GTFS station names exactly", () => {
    expect(matchStation("Bedford Av", stations)?.name).toBe("Bedford Av");
    expect(matchStation("34 St - Herald Square station", stations)?.name).toBe("34 St-Herald Sq");
    expect(matchStation("Grand", stations)).toBeNull();
  });

  it("Grand Central beats GeoSearch's Esplanade Gardens", async () => {
    const geosearch = vi.fn().mockResolvedValue([esplanade]);
    const p = await geocode("Grand Central", { stations: () => Promise.resolve(stations), geosearch });
    expect(p?.label).toBe("Grand Central Terminal");
    expect(p!.at[1]).toBeCloseTo(40.75, 1);
    expect(geosearch).not.toHaveBeenCalled();
  });

  it("Times Square resolves to Midtown", async () => {
    expect((await geocode("Times Square", { stations: () => Promise.resolve([]), geosearch: vi.fn() }))?.label).toBe("Times Square");
  });

  it("station names come before GeoSearch", async () => {
    const geosearch = vi.fn();
    expect((await geocode("Bedford Av", { stations: () => Promise.resolve(stations), geosearch }))?.label).toBe("Bedford Av station");
    expect(geosearch).not.toHaveBeenCalled();
  });

  it("falls back to GeoSearch when the station list fails, preferring the highest confidence", async () => {
    const geosearch = vi.fn().mockResolvedValue([{ ...esplanade, confidence: 0.6 }, { label: "350 5 AVENUE", at: [-73.98, 40.75], confidence: 0.95 }]);
    const p = await geocode("350 5th Ave", { stations: () => Promise.reject(new Error("down")), geosearch });
    expect(p?.label).toBe("350 5 AVENUE");
  });

  it("drops low-confidence GeoSearch matches", () => {
    expect(bestCandidate([{ ...esplanade, confidence: 0.3 }])).toBeNull();
  });
});

describe("businesses by name", () => {
  it("asks for a store with its area, and leaves addresses to GeoSearch", () => {
    expect(businessQuery("Aldi at Rego Park")).toBe("Aldi, Rego Park");
    expect(businessQuery("Trader Joe's near Union Square")).toBe("Trader Joe's, Union Square");
    expect(businessQuery("61-11 Junction Blvd")).toBeNull();
  });

  it("uses the store over GeoSearch's nearest address when one is found", async () => {
    const geosearch = vi.fn();
    const shops = vi.fn().mockResolvedValue({ label: "Aldi, 61-11 Junction Boulevard, Rego Park", at: [-73.86, 40.73] });
    const p = await geocode("Aldi at Rego Park", { stations: () => Promise.resolve([]), geosearch, shops });
    expect(p?.label).toContain("Aldi");
    expect(geosearch).not.toHaveBeenCalled();
  });

  it("falls back to GeoSearch when the store lookup fails", async () => {
    const geosearch = vi.fn().mockResolvedValue([]);
    await geocode("Some Place in Queens", { stations: () => Promise.resolve([]), geosearch, shops: () => Promise.reject(new Error("down")) });
    expect(geosearch).toHaveBeenCalled();
  });
});
