/**
 * Hold rule, with real trip and stop ids from the MTA BDFM feed captured on
 * 2026-10-21 (server/features/transit/__fixtures__): F trip 094550_F..S was
 * STOPPED_AT Bay Pkwy (F32S) at capture time.
 */
import { describe, expect, it } from "vitest";
import { SHOW_AFTER_S, heldTrains, updateHold, type HoldTrip } from "./holds";

const NOW = 1792616621; // capture time
const base: HoldTrip = { id: "094550_F..S", route: "F", stops: [["F33S", NOW + 120], ["F34S", NOW + 240]], at: "F33S", st: 2 };

describe("held trains", () => {
  it("flags Delayed when each refresh pushes the next-stop ETA later near the same point", () => {
    let h = updateHold(undefined, base, NOW);
    h = updateHold(h.state, { ...base, stops: [["F33S", NOW + 165], ["F34S", NOW + 285]] }, NOW + 15);
    expect(h.held).toBeNull();
    h = updateHold(h.state, { ...base, stops: [["F33S", NOW + 210], ["F34S", NOW + 330]] }, NOW + 30);
    expect(h.held).toBe("Delayed");
    expect(h.heldSince).toBe(NOW);
  });
  it("stays quiet while the ETA holds steady", () => {
    let h = updateHold(undefined, base, NOW);
    for (let t = 30; t <= 90; t += 30) h = updateHold(h.state, base, NOW + t);
    expect(h.held).toBeNull();
  });
  it("flags Holding when STOPPED_AT the same stop well past its time", () => {
    const t: HoldTrip = { ...base, stops: [["F32S", NOW - 200], ["F33S", NOW + 120]], at: "F32S", st: 1 };
    let h = updateHold(undefined, t, NOW);
    expect(h.held).toBeNull();
    h = updateHold(h.state, t, NOW + 200);
    expect(h.held).toBe("Holding");
  });
  it("never calls a train held at its origin or its last stop", () => {
    const last: HoldTrip = { ...base, stops: [["F38S", NOW - 400], ["F39S", NOW - 200]], at: "F39S", st: 1 };
    const origin: HoldTrip = { ...base, origin: true, stops: [["F32S", NOW - 400], ["F33S", NOW + 120]], at: "F32S", st: 1 };
    for (const t of [last, origin]) {
      let h = updateHold(undefined, t, NOW);
      h = updateHold(h.state, t, NOW + 600);
      expect(h.held).toBeNull();
    }
  });
});

describe("held trains in a live snapshot", () => {
  it("shows a hold only once it has lasted SHOW_AFTER_S, and judges each snapshot once", () => {
    const trip: HoldTrip = { id: "094550_F..S#snap", route: "F", stops: [["F32S", NOW - 200], ["F33S", NOW + 120], ["F34S", NOW + 240]], at: "F32S", st: 1 };
    expect(heldTrains({ at: NOW, trips: [trip] }).size).toBe(0);
    const early = { at: NOW + SHOW_AFTER_S - 30, trips: [trip] };
    expect(heldTrains(early).size).toBe(0);
    const later = { at: NOW + SHOW_AFTER_S, trips: [trip] };
    const held = heldTrains(later).get(trip.id);
    expect(held).toMatchObject({ route: "F", kind: "Holding", stop: "F32S", stopped: true, since: NOW, toward: "F34S" });
    expect(heldTrains(later)).toBe(heldTrains(later));
  });
});
