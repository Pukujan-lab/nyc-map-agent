import { describe, expect, it } from "vitest";
import type { ExitPlace, Pt } from "@/lib/map/mapRead";
import type { StaticSystem } from "./model";
import { cornerLine, entranceKind, entranceLabels, shortStreet } from "./entranceLabels";

const ent = (id: string, kind: string, at: Pt) => ({ type: "Feature" as const, properties: { id, name: "47-50 Sts-Rockefeller Ctr", kind }, geometry: { type: "Point" as const, coordinates: at } });
const sys = {
  stations: { type: "FeatureCollection", features: [{ type: "Feature", properties: { id: "D15", name: "47-50 Sts-Rockefeller Ctr", routes: "B D F M" }, geometry: { type: "Point", coordinates: [-73.9812, 40.7587] } }] },
  entrances: {
    type: "FeatureCollection",
    features: [
      ent("D15", "Stair", [-73.98140, 40.75860]),
      ent("D15", "Stair", [-73.98142, 40.75861]),
      ent("D15", "Elevator", [-73.98100, 40.75880]),
      ent("D15", "Easement - Passage", [-73.98120, 40.75870]),
      ent("D15", "Stair", [-73.98000, 40.75990]),
    ],
  },
} as unknown as StaticSystem;
const place = (at: Pt): ExitPlace => ({ streets: at[1] > 40.7595 ? ["6 Avenue", "West 49 Street"] : ["6 Avenue", "West 47 Street"], corner: at[0] > -73.9811 ? "NE" : "SE", landmarks: [] });

describe("entrance labels", () => {
  it("names the corner first, in short street names", () => {
    expect(shortStreet("West 47th Street")).toBe("W 47 St");
    expect(cornerLine({ streets: ["West 48th Street", "6th Avenue"], corner: "SE", landmarks: [] })).toBe("6 Av & W 48 St · SE corner");
    expect(cornerLine({ streets: ["6 Avenue", "West 47 Street"], corner: "SE", landmarks: [] })).toBe("6 Av & W 47 St · SE corner");
    expect(cornerLine({ streets: null, corner: null, landmarks: [] })).toBeNull();
  });

  it("says what the entrance is, and when its elevator is out", () => {
    expect(entranceKind("Stair/Escalator", false)).toBe("Escalator");
    expect(entranceKind("Elevator", true)).toBe("Elevator · out of service");
    expect(entranceKind("Station House", false)).toBeNull();
  });

  it("says when a stair is one way", () => {
    expect(entranceKind("Stair", false, "out")).toBe("Stairs · exit only");
    expect(entranceKind("Stair", false, "in")).toBe("Stairs · entry only");
    expect(entranceKind("Elevator", false, "out")).toBe("Elevator · exit only");
    expect(entranceKind("Elevator", true, "out")).toBe("Elevator · out of service");
  });

  it("from overhead, says what each entrance is and which corner", () => {
    const fc = entranceLabels(sys, new Set(), [-73.9814, 40.7586], place, { max: 2, phone: false, overhead: true });
    expect(fc.features.map((f) => f.properties.label)).toEqual(["Stairs\n6 Av & W 47 St · SE corner", "Elevator\n6 Av & W 47 St · NE corner"]);
  });

  it("labels only the nearest entrances, one per corner and kind", () => {
    const fc = entranceLabels(sys, new Set(["D15"]), [-73.9814, 40.7586], place, { max: 2, phone: false });
    expect(fc.features.map((f) => f.properties.label)).toEqual([
      "47-50 Sts-Rockefeller Ctr · B D F M\nStairs · 6 Av & W 47 St · SE corner",
      "47-50 Sts-Rockefeller Ctr · B D F M\nElevator · out of service · 6 Av & W 47 St · NE corner",
    ]);
  });

  it("keeps a far entrance to the station name on a phone", () => {
    const fc = entranceLabels(sys, new Set(), [-73.9814, 40.7586], place, { max: 6, phone: true, radiusM: 300 });
    const labels = fc.features.map((f) => f.properties.label);
    expect(labels[0]).toBe("47-50 Sts-Rockefeller Ctr · B D F M\nStairs · 6 Av & W 47 St · SE corner");
    expect(labels.at(-1)).toBe("47-50 Sts-Rockefeller Ctr · B D F M");
  });
});
