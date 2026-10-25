import { describe, expect, it } from "vitest";
import { lineAlert, type UsualTrip } from "./commute";
import { lookedUpWhen, rideChips, todayNotices } from "./myDayModel";

const parse = (a: Record<string, unknown>) => lineAlert.parse(a);

describe("My day rows", () => {
  const lines = [{ route: "A", color: "#2563eb", board: "59 St-Columbus Circle" }];

  it("turns a delay into a commute row and an elevator notice into a line row", () => {
    const alerts = [
      parse({ id: "d", kind: "delay", text: "[A] trains are delayed about 6 minutes tonight while crews work at 42 St.", routes: ["A"], period: "Tonight" }),
      parse({ id: "e", kind: "notice", text: "Elevator out at 59 St-Columbus Circle", routes: ["A"] }),
      parse({ id: "o", kind: "notice", text: "[F] skips 2 Av", routes: ["F"], skipNames: ["2 Av"] }),
    ];
    const rows = todayNotices(alerts, lines);
    expect(rows.map((r) => ({ label: r.label, detail: r.detail, open: r.open, elevator: r.elevator }))).toEqual([
      { label: "Tonight", detail: "+6 min", open: "commute", elevator: false },
      { label: "59 St-Columbus Circle elevator out", open: "line", elevator: true },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/leave later|café|cafe|shop|restaurant/i);
  });

  it("names skipped stops on the usual line and ignores other lines", () => {
    const alerts = [parse({ id: "s", kind: "planned", text: "[A] skips 50 St and 23 St", routes: ["A"], skipNames: ["50 St", "23 St"] })];
    expect(todayNotices(alerts, lines)).toEqual([
      expect.objectContaining({ label: "A skips 2", open: "line", elevator: false }),
    ]);
    expect(todayNotices(alerts, [{ route: "C" }])).toEqual([]);
  });

  it("chips the usual ride and its other lines, without a made-up clock time", () => {
    const work: UsualTrip = { route: "A", color: "#2563eb", minutes: 28, board: "59 St", transfers: [], alternatives: [{ route: "M23", minutes: 35, transfers: [] }] };
    const home: UsualTrip = { route: "A", minutes: 30, transfers: [], alternatives: [] };
    const chips = rideChips([["work", work], ["home", home]]);
    expect(chips.map((c) => c.label)).toEqual(["Work", "M23", "Home"]);
    expect(chips.every((c) => !/\d:\d\d/.test(c.label))).toBe(true);
  });

  it("labels a looked-up trip with the New York time and no coordinates", () => {
    const label = lookedUpWhen(Date.parse("2026-10-24T15:00:00Z"), "Home", "Work");
    expect(label).toBe("Sat 11:00 AM · Home to Work");
    expect(label).not.toMatch(/-73|40\.\d/);
  });
});
