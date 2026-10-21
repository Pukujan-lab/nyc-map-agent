import { describe, expect, it } from "vitest";
import { describeStep } from "./drive/router";
import { MTA_TOLLS, tolls } from "./drive/context";
import { args } from "./tools";
import { nyLocalToDate, toNyLocal } from "./trip";
import { octant } from "./transit";

describe("tool argument schemas", () => {
  it("transit_plan defaults from to 'here' and needs a local time", () => {
    expect(args.transit_plan.parse({ to: "Grand Central", depart: "2026-10-22T09:00" }).from).toBe("here");
    expect(() => args.transit_plan.parse({ to: "Grand Central", depart: "tomorrow 9am" })).toThrow();
  });
  it("playFlythrough only accepts 2x/10x/30x", () => {
    expect(args.playFlythrough.parse({ tripId: "t" }).speed).toBe(10);
    expect(() => args.playFlythrough.parse({ tripId: "t", speed: 5 })).toThrow();
  });
  it("drive_plan and weather validate", () => {
    expect(args.drive_plan.safeParse({ to: "JFK", depart: "2026-10-22T07:30" }).success).toBe(true);
    expect(args.weather_forecast.safeParse({ time: "nope" }).success).toBe(false);
  });
});

describe("time + geometry helpers", () => {
  it("New York local time is DST-correct", () => {
    expect(nyLocalToDate("2026-10-22T09:00").toISOString()).toBe("2026-10-22T13:00:00.000Z");
    expect(nyLocalToDate("2026-12-22T09:00").toISOString()).toBe("2026-12-22T14:00:00.000Z");
    expect(toNyLocal(new Date("2026-10-22T13:00:00Z"))).toBe("2026-10-22T09:00");
  });
  it("octant names exits by compass corner", () => {
    expect(octant([-73.977, 40.752], [-73.976, 40.753])).toBe("NE");
  });
});

describe("drive helpers", () => {
  it("turns OSRM lanes into a lane hint", () => {
    const text = describeStep({
      name: "East 9th Street",
      maneuver: { type: "turn", modifier: "left", location: [0, 0] },
      intersections: [{ lanes: [{ valid: true, indications: ["left"] }, { valid: false, indications: ["none"] }, { valid: false, indications: ["none"] }] }],
    });
    expect(text).toBe("Turn left onto East 9th Street — use the left lane");
  });
  it("skips non-decision steps", () => {
    expect(describeStep({ name: "x", maneuver: { type: "depart", location: [0, 0] }, intersections: [] })).toBeNull();
  });
  it("finds tolls only for crossings on the route", () => {
    const rfk = MTA_TOLLS[0].at;
    expect(tolls([[rfk[0] - 0.001, rfk[1]], rfk, [rfk[0] + 0.001, rfk[1]]])).toHaveLength(1);
    expect(tolls([[-74.0, 40.7], [-73.99, 40.71]])).toHaveLength(0);
  });
});
