import { describe, expect, it } from "vitest";
import { TapCycle } from "./tapCycle";

const train = (key: string) => ({ layer: { id: "transit-vehicle-hit" }, properties: { key } });
const station = { layer: { id: "transit-station" }, properties: { id: "R20", system: "subway" } };
const label = { layer: { id: "transit-station-label" }, properties: { id: "R20", system: "subway" } };
const skip = { layer: { id: "transit-skip" }, properties: { id: "R20" } };
const p = { x: 100, y: 100 };

describe("tap cycle", () => {
  it("one train in a station: first tap the train, second the station", () => {
    const c = new TapCycle();
    const hits = [train("subway:a"), station, label];
    expect(c.next(p, hits)).toBe(hits[0]);
    expect(c.next(p, hits)).toBe(station);
    expect(c.next(p, hits)).toBe(hits[0]);
  });

  it("three trains: each train in turn, then the station", () => {
    const c = new TapCycle();
    const hits = [train("subway:a"), train("subway:a"), train("subway:b"), train("subway:c"), skip, station];
    expect([1, 2, 3, 4].map(() => c.next(p, hits))).toEqual([hits[0], hits[2], hits[3], station]);
  });

  it("starts over on a different spot or when the trains moved on", () => {
    const c = new TapCycle();
    const hits = [train("subway:a"), station];
    c.next(p, hits);
    expect(c.next({ x: 200, y: 100 }, hits)).toBe(hits[0]);
    c.next({ x: 200, y: 100 }, hits);
    const moved = [train("subway:b"), station];
    expect(c.next({ x: 200, y: 100 }, moved)).toBe(moved[0]);
  });

  it("a skip marker alone still opens", () => {
    expect(new TapCycle().next(p, [skip])).toBe(skip);
  });
});
