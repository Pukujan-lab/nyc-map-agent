import { describe, expect, it } from "vitest";
import { routesFromStops } from "./hooks";

describe("Live buses near you", () => {
  it("turns on the routes serving the most nearby stops, busiest first, capped", () => {
    const stops = [{ routes: ["Q32", "Q60"] }, { routes: ["Q60", "Q102"] }, { routes: ["Q60", "Q32", "Q32"] }, { routes: ["Q66"] }];
    expect(routesFromStops(stops)).toEqual(["Q60", "Q32", "Q102", "Q66"]);
    expect(routesFromStops(stops, 2)).toEqual(["Q60", "Q32"]);
    expect(routesFromStops([])).toEqual([]);
  });
});
