import { describe, expect, it } from "vitest";
import { remindAt, tripIcs, tripSteps } from "./reminder";
import type { Trip } from "./schema";

const trip = {
  id: "abc", mode: "transit",
  origin: { label: "Union Square", at: [-73.99, 40.735] }, destination: { label: "Flushing, Main St", at: [-73.83, 40.76] },
  departIso: "2026-10-26T18:00", arriveIso: "2026-10-26T18:52",
  legs: [
    { kind: "ride", route: "4", fromStop: "14 St-Union Sq", toStop: "Grand Central-42 St", label: "4 train" },
    { kind: "transfer", label: "Change to the 7" },
    { kind: "ride", route: "7", fromStop: "Grand Central-42 St", toStop: "Flushing-Main St", label: "7 train" },
  ],
  alerts: ["7 trains skip 82 St"], scheduled: { future: true, note: "Planned for tomorrow" },
} as unknown as Trip;

describe("trip reminder", () => {
  it("lists the trip in order", () => {
    expect(tripSteps(trip)).toEqual(["Take the 4 from 14 St-Union Sq to Grand Central-42 St", "Change to the 7", "Take the 7 from Grand Central-42 St to Flushing-Main St"]);
  });

  it("makes a calendar event at the leave time with an alert 10 minutes before", () => {
    const ics = tripIcs(trip, new Date("2026-10-25T12:00:00Z"));
    expect(ics).toContain("DTSTART;TZID=America/New_York:20261026T180000\r\n");
    expect(ics).toContain("DTEND;TZID=America/New_York:20261026T185200\r\n");
    expect(ics).toContain("SUMMARY:Leave for Flushing\\, Main St\r\n");
    expect(ics).toContain("TRIGGER:-PT10M\r\n");
    expect(ics).toContain("UID:trip-abc@nyc.design-bakery.com");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    // RFC 5545: no line longer than 75 octets.
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("says when the alert comes, across midnight too", () => {
    expect(remindAt(trip)).toBe("17:50");
    expect(remindAt({ ...trip, departIso: "2026-10-27T00:05" })).toBe("23:55");
  });
});
