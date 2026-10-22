import { describe, expect, it } from "vitest";
import { parseProse, slimAlert } from "./alerts";

describe("MTA alert slimming", () => {
  it("keeps Mercury period, direction ids and skipped-stop ids", () => {
    const a = slimAlert({
      id: "lmm:1",
      alert: {
        active_period: [{ start: 100, end: 200 }],
        informed_entity: [{ agency_id: "MTASBWY", route_id: "F", stop_id: "F34" }, { agency_id: "MTASBWY", route_id: "F", stop_id: "F33" }],
        header_text: { translation: [{ text: "In Brooklyn, Manhattan-bound [F] skips Avenue P, Avenue N, Bay Pkwy and Avenue I", language: "en" }] },
        description_text: { translation: [{ text: "Take the [F] to 18 Av.", language: "en" }] },
        "transit_realtime.mercury_alert": { alert_type: "Planned - Stops Skipped", human_readable_active_period: { translation: [{ text: "Nov 17 - 20", language: "en" }] }, affected_stations: [{ stop_id: "F34", direction_id: 0 }] },
      },
    }, 150)!;
    expect(a).toMatchObject({ kind: "planned", reroute: true, routes: ["F"], stops: ["F34", "F33"], period: "Nov 17 - 20", direction: "Manhattan-bound", directionIds: [0], start: 100, end: 200 });
    expect(a.skipNames).toEqual(["Avenue P", "Avenue N", "Bay Pkwy", "Avenue I"]);
  });
  it("drops alerts outside their active period", () => {
    expect(slimAlert({ id: "x", alert: { active_period: [{ start: 500 }] } }, 100)).toBeNull();
  });
  it("parses reroute lines and closed stations from the prose", () => {
    const p = parseProse("[F] is rerouted via Court Sq [E] between Roosevelt Av, Queens and Canal St, then via the [A] to Jay St-MetroTech\nNo [F] service at 21 St-Queensbridge, Roosevelt Island, East Broadway and York St.", "F");
    expect(p.via).toEqual(["E", "A"]);
    expect(p.skipNames).toEqual(["21 St-Queensbridge", "Roosevelt Island", "East Broadway", "York St"]);
  });
});
