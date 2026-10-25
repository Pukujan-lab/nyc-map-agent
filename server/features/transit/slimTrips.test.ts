/** Real GTFS-rt trips captured from the MTA ACE and BDFM feeds on 2026-10-21, re-encoded per case. */
import { readFileSync } from "node:fs";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { describe, expect, it } from "vitest";
import { slimTrips } from "./routes";

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
type Stu = { stopId?: string; scheduleRelationship?: string };
type Obj = { header: { timestamp: number }; entity: Array<{ tripUpdate?: { trip: { scheduleRelationship?: string }; stopTimeUpdate: Stu[] } }> };
const raw = (): Obj => JSON.parse(readFileSync(new URL("./__fixtures__/mta-bdfm-ace-trips-2026-10-21.json", import.meta.url), "utf8")) as Obj;
const decode = (o: Obj) => FeedMessage.decode(FeedMessage.encode(FeedMessage.fromObject(o)).finish());
const NOW = 1792616621; // capture time

describe("GTFS-rt trips from the live capture", () => {
  it("keeps the vehicle's stop, current_status and timestamp", () => {
    const { trips } = slimTrips([decode(raw())], NOW);
    const f = trips.find((t) => t.id === "094550_F..S")!;
    // The capture has this F STOPPED_AT Bay Pkwy (F32S).
    expect(f).toMatchObject({ route: "F", at: "F32S", st: 1, vt: 1792616605 });
    expect(f.skipped).toBeUndefined();
  });
  it("drops SKIPPED stops from the path and lists them in order", () => {
    const o = raw();
    for (const s of o.entity[0].tripUpdate!.stopTimeUpdate) if (s.stopId === "F34S" || s.stopId === "F35S") s.scheduleRelationship = "SKIPPED";
    const t = slimTrips([decode(o)], NOW).trips.find((x) => x.id === "094550_F..S")!;
    expect(t.skipped).toEqual(["F34S", "F35S"]);
    expect(t.stops.map(([s]) => s)).not.toContain("F34S");
    expect(t.stops.map(([s]) => s)).not.toContain("F35S");
  });
  it("removes CANCELED trips", () => {
    const o = raw();
    o.entity[2].tripUpdate!.trip.scheduleRelationship = "CANCELED";
    const ids = slimTrips([decode(o)], NOW).trips.map((t) => t.id);
    expect(ids).toContain("094550_F..S");
    expect(ids).not.toContain("096450_A..S58R");
  });
});
