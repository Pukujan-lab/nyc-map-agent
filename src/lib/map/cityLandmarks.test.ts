import { describe, expect, it } from "vitest";
import { CITY_LANDMARKS, cityLandmarkById, landmarkCollection, wikiSummaryUrl } from "./cityLandmarks";

describe("city landmarks", () => {
  it("covers every borough with a unique place and a Wikipedia title", () => {
    const ids = new Set(CITY_LANDMARKS.map((m) => m.id));
    expect(ids.size).toBe(CITY_LANDMARKS.length);
    for (const borough of ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"] as const) {
      expect(CITY_LANDMARKS.filter((m) => m.borough === borough).length).toBeGreaterThanOrEqual(6);
    }
    for (const m of CITY_LANDMARKS) {
      expect(m.wiki.length).toBeGreaterThan(2);
      expect(m.lat).toBeGreaterThan(40.49);
      expect(m.lat).toBeLessThan(40.92);
      expect(m.lon).toBeGreaterThan(-74.26);
      expect(m.lon).toBeLessThan(-73.7);
    }
  });
  it("uses the same ids as the four hero models", () => {
    for (const id of ["empire-state", "chrysler", "one-wtc", "liberty"]) expect(cityLandmarkById(id)?.name).toBeTruthy();
  });
  it("draws one point per landmark", () => {
    const fc = landmarkCollection();
    expect(fc.features).toHaveLength(CITY_LANDMARKS.length);
    expect(fc.features[0]?.geometry.type).toBe("Point");
  });
  it("asks Wikipedia for the summary of that title", () => {
    expect(wikiSummaryUrl("Empire_State_Building")).toBe("https://en.wikipedia.org/api/rest_v1/page/summary/Empire_State_Building");
    expect(wikiSummaryUrl("St._Patrick's_Cathedral_(Manhattan)")).toContain("St._Patrick's_Cathedral_");
  });
});
