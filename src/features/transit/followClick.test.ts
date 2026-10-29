import { describe, expect, it } from "vitest";
import { followActionForMapClick } from "./followClick";

const VEHICLES = ["transit-vehicle-2d", "transit-vehicle-hit", "transit-bullet", "transit-bus-badge", "transit-bus-badge-full", "transit-bus-badge-selected"];
const NOT_VEHICLES = ["transit-station", "transit-station-raised", "transit-station-label", "transit-entrance", "transit-access", "restrooms", "ferry-vessels"];

describe("followActionForMapClick", () => {
  it("starts Follow on a train or a bus", () => {
    for (const layerId of VEHICLES) {
      expect(followActionForMapClick({ layerId, key: "bus:Q44" })).toEqual({ action: "start", key: "bus:Q44" });
    }
    expect(followActionForMapClick({ layerId: "transit-vehicle-hit", key: 7 })).toEqual({ action: "start", key: "7" });
  });

  it("drops Follow on empty map, a station, or anything that is not a train or a bus", () => {
    expect(followActionForMapClick(null)).toEqual({ action: "clear" });
    for (const layerId of NOT_VEHICLES) {
      expect(followActionForMapClick({ layerId, key: "subway:A" })).toEqual({ action: "clear" });
    }
  });

  it("lets go of the train you already follow", () => {
    expect(followActionForMapClick({ layerId: "transit-vehicle-hit", key: "subway:L1" }, "subway:L1")).toEqual({ action: "release" });
    expect(followActionForMapClick({ layerId: "transit-vehicle-hit", key: "subway:L2" }, "subway:L1")).toEqual({ action: "start", key: "subway:L2" });
  });
});
