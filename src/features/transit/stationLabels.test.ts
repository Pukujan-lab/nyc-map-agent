import { describe, expect, it } from "vitest";
import { labelledStationIds } from "./stationLabels";

describe("labelledStationIds", () => {
  it("keeps one label for same-name stations in one complex", () => {
    const ids = labelledStationIds([
      { id: "a", name: "Times Sq-42 St", lon: -73.9869, lat: 40.7553 },
      { id: "b", name: "Times Sq-42 St", lon: -73.9875, lat: 40.7559 },
    ]);
    expect([...ids]).toEqual(["a"]);
  });
  it("keeps same-name stations that are far apart", () => {
    const ids = labelledStationIds([
      { id: "a", name: "125 St", lon: -73.95, lat: 40.81 },
      { id: "b", name: "125 St", lon: -73.93, lat: 40.8 },
    ]);
    expect(ids.size).toBe(2);
  });
  it("keeps different names that are close", () => {
    const ids = labelledStationIds([
      { id: "a", name: "A", lon: 0, lat: 0 },
      { id: "b", name: "B", lon: 0, lat: 0 },
    ]);
    expect(ids.size).toBe(2);
  });
});
