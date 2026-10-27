import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBusRoutesNear, routesFromStops } from "./hooks";

describe("Live buses near you", () => {
  it("turns on the routes serving the most nearby stops, busiest first, capped", () => {
    const stops = [{ routes: ["Q32", "Q60"] }, { routes: ["Q60", "Q102"] }, { routes: ["Q60", "Q32", "Q32"] }, { routes: ["Q66"] }];
    expect(routesFromStops(stops)).toEqual(["Q60", "Q32", "Q102", "Q66"]);
    expect(routesFromStops(stops, 2)).toEqual(["Q60", "Q32"]);
    expect(routesFromStops([])).toEqual([]);
  });

  afterEach(() => vi.unstubAllGlobals());
  it("looks about 700 m out when no stop is within 300 m, as over Newtown Creek", async () => {
    const asked: number[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const lat = Number(new URL(url, "http://x").searchParams.get("lat"));
      asked.push(lat);
      // Only the point to the north has a stop.
      const stops = lat > 40.7240 ? [{ id: "s", name: "n", lat, lon: 0, dir: "N", routes: ["B24"] }] : [];
      return Promise.resolve(new Response(JSON.stringify({ stops }), { headers: { "content-type": "application/json" } }));
    }));
    expect(await fetchBusRoutesNear({ lat: 40.7200, lon: -73.9300 })).toEqual(["B24"]);
    expect(asked).toHaveLength(9);
  });
});
