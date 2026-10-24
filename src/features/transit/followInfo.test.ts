import { describe, expect, it } from "vitest";
import { alertTimeLabel, classifyRouteAlerts, skipNamesFor } from "./followInfo";
import type { TransitAlert } from "./hooks";

const alert = (p: Partial<TransitAlert>): TransitAlert => ({ id: "a", kind: "notice", type: "", reroute: false, text: "", agency: "", routes: [], stops: [], ...p });

describe("follow card alerts", () => {
  const list = [
    alert({ id: "d", kind: "delay", routes: ["F"], text: "Delays" }),
    alert({ id: "n", kind: "notice", routes: ["F"], text: "Notice" }),
    alert({ id: "p", kind: "planned", routes: ["F"], reroute: true, text: "Work" }),
    alert({ id: "o", kind: "delay", routes: ["A"], text: "Other" }),
  ];
  it("splits delays from notices for the followed route", () => {
    const g = classifyRouteAlerts(list, "F");
    expect(g.delays.map((a) => a.id)).toEqual(["d"]);
    expect(g.notices.map((a) => a.id)).toEqual(["n", "p"]);
  });
  it("uses the alert period, and says nothing when there is no time", () => {
    expect(alertTimeLabel({ period: "Weeknights 10pm – 5am" })).toBe("Weeknights 10pm – 5am");
    expect(alertTimeLabel({ start: 1_700_000_000 })).toMatch(/until further notice/);
    expect(alertTimeLabel({})).toBeNull();
    expect(alertTimeLabel(undefined)).toBeNull();
  });
  it("names the stations that trip skips", () => {
    const a = alert({
      routes: ["7"],
      changes: [{ alertId: "a", route: "7", kind: "skip", names: ["52 St", "69 St"], toward: "Flushing", notice: "Skipped Flushing-bound" }],
    });
    expect(skipNamesFor(a, "7")).toEqual(["52 St", "69 St"]);
    expect(skipNamesFor(a, "F")).toEqual([]);
  });
});
