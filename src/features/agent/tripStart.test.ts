import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { walkToBoard } from "./tripStart";
import type { Trip } from "./schema";

const trip = JSON.parse(readFileSync(new URL("../../../e2e/fixtures/agent-trip.json", import.meta.url), "utf8")) as Trip;

describe("walkToBoard", () => {
  it("walks to the station entrance before the ride", () => {
    const walk = trip.legs[0] as Extract<Trip["legs"][number], { kind: "walk" }>;
    expect(walkToBoard(trip)).toEqual({ at: walk.coords.at(-1), metres: walk.distanceM });
  });
  it("starts with the ride when you are already at the stop", () => {
    const near = { legs: trip.legs.map((l) => (l.kind === "walk" ? { ...l, distanceM: 30 } : l)) } as Trip;
    expect(walkToBoard(near)).toBeNull();
  });
  it("has nothing to board on a walk-only trip", () => {
    expect(walkToBoard({ legs: [trip.legs[0]] } as Trip)).toBeNull();
  });
});
