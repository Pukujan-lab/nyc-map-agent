/**
 * Disruption rules against real captured MTA data: the subway static build
 * (public/transit/subway.json) and alerts captured from the live Mercury feed
 * on 2026-10-21 (server/features/transit/__fixtures__). Trip cases reuse real
 * trip and stop ids from the same capture.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateTrain, type LiveTrip, type StaticSystem } from "./model";
import { alertSegments, alertStations, parseBetween, parseDirection, summarizeAlert, tripPath, updateHold, type DisruptionAlert } from "./disruptions";
import { slimAlerts, type MercuryAlert } from "../../../server/features/transit/routes";

const sys = JSON.parse(readFileSync(new URL("../../../public/transit/subway.json", import.meta.url), "utf8")) as StaticSystem;
const capture = JSON.parse(readFileSync(new URL("../../../server/features/transit/__fixtures__/mta-subway-alerts-2026-10-21.json", import.meta.url), "utf8")) as { header: { timestamp: number }; entity: MercuryAlert[] };
const NOW = 1792616621; // capture time
const alerts = slimAlerts(capture.entity, NOW) as DisruptionAlert[];
const byId = (id: string) => alerts.find((a) => a.id === id)!;

describe("reroutes and skipped stops", () => {
  it("draws a hop on another line's track when the trip's stops are on it (F via the A)", () => {
    // Real ids: Manhattan-bound F stopping at A-line platforms Jay St → W 4 St.
    const trip: LiveTrip = { id: "094550_F..N", route: "F", dir: 0, stops: [["A41N", NOW - 60], ["A40N", NOW + 60], ["A38N", NOW + 180], ["A32N", NOW + 600]] };
    const v = estimateTrain(sys, { ...trip, stops: [["A40N", NOW - 30], ["A38N", NOW + 90], ["A36N", NOW + 200]] }, NOW)!;
    expect(v.track).toBeDefined();
    expect(sys.stopM[v.track!].A38).toBeDefined();
    const path = tripPath(sys, trip);
    expect(path.length).toBeGreaterThan(2);
  });
  it("skipped stops never shape the path and the train never stops there", () => {
    const trip: LiveTrip = { id: "g", route: "G", dir: 1, stops: [["F22S", NOW - 60], ["F26S", NOW + 240]], skipped: ["F23S", "F24S", "F25S"] };
    const v = estimateTrain(sys, trip, NOW)!;
    expect(v.nextStop).toBe("F26S");
  });
});

describe("held trains", () => {
  const base: LiveTrip = { id: "094550_F..S", route: "F", dir: 1, stops: [["F33S", NOW + 120], ["F34S", NOW + 240]], at: "F33S", st: 2 };
  it("flags Delayed when each refresh pushes the next-stop ETA later near the same point", () => {
    let h = updateHold(undefined, base, NOW);
    h = updateHold(h.state, { ...base, stops: [["F33S", NOW + 165], ["F34S", NOW + 285]] }, NOW + 15);
    expect(h.held).toBeNull();
    h = updateHold(h.state, { ...base, stops: [["F33S", NOW + 210], ["F34S", NOW + 330]] }, NOW + 30);
    expect(h.held).toBe("Delayed");
    // Frozen where it was when the slipping started.
    const a = estimateTrain(sys, base, NOW + 30, { held: h.held!, heldSince: h.heldSince });
    const b = estimateTrain(sys, base, NOW + 90, { held: h.held!, heldSince: h.heldSince });
    expect(a!.lon).toBe(b!.lon);
  });
  it("flags Holding when STOPPED_AT the same stop well past its time", () => {
    const t: LiveTrip = { ...base, stops: [["F32S", NOW - 200], ["F33S", NOW + 120]], at: "F32S", st: 1 };
    let h = updateHold(undefined, t, NOW);
    h = updateHold(h.state, t, NOW + 200);
    expect(h.held).toBe("Holding");
  });
  it("never extrapolates past a stop the feed has not cleared", () => {
    // Real capture: F 094550 STOPPED_AT Bay Pkwy (F32S). Even after F32S's time passes, it stays there.
    const t: LiveTrip = { id: "094550_F..S", route: "F", dir: 1, stops: [["F32S", NOW - 120], ["F33S", NOW - 10], ["F34S", NOW + 100]], at: "F32S", st: 1 };
    const v = estimateTrain(sys, t, NOW)!;
    expect(v.nextStop).toBe("F32S");
    const bay = sys.stations.features.find((f) => f.properties.id === "F32")!.geometry.coordinates;
    expect(Math.hypot(v.lon - bay[0], v.lat - bay[1])).toBeLessThan(0.003);
  });
});

describe("alerts from the live capture", () => {
  it("keeps header, description, active period and stop entities", () => {
    const g = byId("lmm:planned_work:35713");
    expect(g.type).toBe("Planned - Stops Skipped");
    expect(g.description).toMatch(/Court Sq-bound/);
    expect(g.period).toBe("Oct 19 - 26, Mon to Fri days and evenings, and all weekend");
    expect(g.ents).toEqual([{ route: "G", stop: "F23", dir: 1 }, { route: "G", stop: "F25", dir: 1 }]);
  });
  it("draws the segment between the first and last affected stops on that route", () => {
    const segs = alertSegments(sys, byId("lmm:planned_work:35713"));
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ route: "G", from: "F23", to: "F25", source: "stops" });
    // One stop only: no segment, just the station dot.
    expect(alertSegments(sys, byId("lmm:planned_work:29949"))).toEqual([]);
    expect(alertStations(sys, byId("lmm:planned_work:29949"))).toEqual(["409"]);
  });
  it("summarizes skipped stops with the neighbouring stations as alternatives", () => {
    const s = summarizeAlert(sys, byId("lmm:planned_work:29949"))!;
    expect(s).toMatch(/^Woodlawn-bound 4 skips Burnside Av\. Use /);
    expect(s).toContain("176 St");
    expect(s).toContain("183 St");
    // Fort Hamilton Pkwy is named as skipped in the header, so it is never offered as the alternative.
    expect(summarizeAlert(sys, byId("lmm:planned_work:35713"))).toBe("Church Av-bound G skips 4 Av-9 St and 15 St-Prospect Park. Use Smith-9 Sts.");
    expect(summarizeAlert(sys, byId("lmm:planned_work:31498"))).toMatch(/^Flushing-bound 7 skips 52 St and 69 St\./);
  });
  it("summarizes delays and names the station only when it resolves", () => {
    expect(summarizeAlert(sys, byId("lmm:alert:272874:26"))).toBe("Middle Village-Metropolitan Av-bound M is delayed near Myrtle-Wyckoff Avs.");
    expect(summarizeAlert(sys, byId("lmm:alert:272878:26"))).toBe("2/5 are delayed near Flatbush Av-Brooklyn College.");
  });
  it("falls back to the MTA header for station notices", () => {
    expect(summarizeAlert(sys, byId("lmm:planned_work:33366"))).toBeNull();
  });
});

describe("text parsing for route-only alerts", () => {
  const routeOnly = (text: string, routes: string[], type: string): DisruptionAlert => ({ id: "x", kind: "planned", type, reroute: true, text, description: "", agency: "MTASBWY", routes, stops: [], ents: [] });
  it("resolves 'between A and B' only when both stations are ours", () => {
    expect(parseBetween(sys, "No [7] trains between Queensboro Plaza and Times Sq-42 St", ["7"])?.map((s) => s.id)).toEqual(["718", "725"]);
    expect(parseBetween(sys, "No [7] trains between Queensboro Plaza and Nowhere Junction", ["7"])).toBeNull();
    expect(alertSegments(sys, routeOnly("No [7] trains between Queensboro Plaza and Nowhere Junction", ["7"], "No Scheduled Service"))).toEqual([]);
  });
  it("says where to go instead, from lines serving both station complexes", () => {
    const a = routeOnly("No [7] trains between Queensboro Plaza and Times Sq-42 St", ["7"], "Part Suspended");
    expect(summarizeAlert(sys, a)).toBe("No 7 between Queensboro Plaza and Times Sq-42 St. Take the N/W.");
    expect(alertSegments(sys, a)[0]).toMatchObject({ route: "7", source: "text" });
  });
  it("describes a reroute onto another line", () => {
    const a = routeOnly("Manhattan-bound [F] trains run via the [A] between Jay St-MetroTech and W 4 St-Wash Sq", ["F"], "Reroute");
    expect(summarizeAlert(sys, a)).toBe("Manhattan-bound F runs on the A line between Jay St-MetroTech and W 4 St-Wash Sq.");
    expect(alertSegments(sys, a)[0].coords.length).toBeGreaterThan(2);
  });
  it("reads direction words", () => {
    expect(parseDirection("Uptown [1] trains skip 79 St")).toEqual({ label: "Uptown" });
    expect(parseDirection("[A] trains run on the local track")).toEqual({ label: "", track: "local" });
  });
});
