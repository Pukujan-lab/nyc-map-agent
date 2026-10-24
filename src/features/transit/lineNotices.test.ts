import { describe, expect, it } from "vitest";
import { lineNotices } from "./lineNotices";
import type { Outage, TransitAlert } from "./hooks";
import type { StaticSystem } from "./model";

const st = (id: string, name: string, routes: string, lon: number): GeoJSON.Feature<GeoJSON.Point, { id: string; name: string; routes: string }> => ({
  type: "Feature", properties: { id, name, routes }, geometry: { type: "Point", coordinates: [lon, 40.75] },
});
const sys = {
  system: "subway",
  routes: {},
  lines: { type: "FeatureCollection", features: [] },
  stations: { type: "FeatureCollection", features: [st("A27", "42 St-Port Authority Bus Terminal", "A C E", -73.99), st("A28", "34 St-Penn Station", "A C E", -73.993), st("A31", "14 St", "A C E L", -74.0)] },
  shapes: { A: { c: [[-73.99, 40.75], [-73.993, 40.75], [-74.0, 40.75]], m: [0, 1000, 2000], g: ["underground", "underground", "underground"] } },
  stopM: { A: { A27: 0, A28: 1000, A31: 2000 } },
} as unknown as StaticSystem;

const alert = (over: Partial<TransitAlert>): TransitAlert => ({ id: "x", kind: "notice", type: "", reroute: false, text: "", agency: "MTASBWY", routes: ["A"], stops: [], ...over });

describe("lineNotices", () => {
  it("keeps only this line's subway alerts, delays first, and rings a delay's named station", () => {
    const out = lineNotices("A", [
      alert({ id: "w", kind: "planned", text: "Downtown [A] skips 34 St-Penn Station", stops: ["A28S"], skipNames: ["34 St-Penn Station"], period: "Sat and Sun" }),
      alert({ id: "d", kind: "delay", text: "[A] trains are delayed while we fix a signal problem at 42 St-Port Authority Bus Terminal.", start: 100 }),
      alert({ id: "other", kind: "delay", routes: ["6"], text: "6 delays" }),
      alert({ id: "mnr", agency: "MNR", text: "A" }),
    ], [], sys, 200);
    expect(out.map((n) => n.id)).toEqual(["d", "w"]);
    expect(out[0].title).toContain("A trains are delayed");
    expect(out[0].stations.map((s) => s.label)).toEqual(["Delays"]);
    expect(out[0].stations[0].id).toBe("A27");
    expect(out[1].meta).toBe("Planned work · Sat and Sun");
    expect(out[1].stations).toEqual([{ id: "A28", name: "34 St-Penn Station", coord: [-73.993, 40.75], label: "Skipped" }]);
  });

  it("turns an elevator outage into an access notice ringed at its station", () => {
    const o: Outage = { id: "EL1", station: "14 St", routes: ["A", "C", "E"], stops: ["A31"], equipment: "Elevator", serving: "Street to mezzanine", reason: "Repair", since: "", back: "Nov 2", ada: "yes", alternative: "" };
    const [n] = lineNotices("A", [], [o], sys);
    expect(n.tone).toBe("access");
    expect(n.title).toBe("Elevator out at 14 St");
    expect(n.meta).toBe("Street to mezzanine · until Nov 2");
    expect(n.stations[0].label).toBe("No elevator");
  });

  it("is empty without the static system", () => {
    expect(lineNotices("A", [alert({})], [], undefined)).toEqual([]);
  });
});
