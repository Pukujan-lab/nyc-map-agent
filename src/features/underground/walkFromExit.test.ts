import { describe, expect, it } from "vitest";
import { walkFromExit, type ExitPack, type PackStore } from "./pack";

const pack = (id: string, at: [number, number]): ExitPack => ({ station: { id, name: id, at }, exits: [], trackBearing: null, sketch: [] });
const final = pack("34", [-73.9877, 40.7496]);
const store = (walkOut?: [number, number][]): PackStore => ({ v: 3, savedAt: 0, destination: { label: "Empire State Building", at: [-73.9857, 40.7484] }, packs: [pack("GC", [-73.977, 40.752]), final], status: null, ...(walkOut ? { walkOut } : {}) });

describe("walk from the exit", () => {
  it("follows the trip's street route from the point nearest the exit", () => {
    const route: [number, number][] = [[-73.9877, 40.7496], [-73.987, 40.7491], [-73.9862, 40.7487], [-73.9857, 40.7484]];
    expect(walkFromExit(store(route), final, [-73.9871, 40.7492])).toEqual([[-73.9871, 40.7492], ...route.slice(1)]);
  });
  it("draws a straight hint when the trip has no street walk", () => {
    expect(walkFromExit(store(), final, [-73.9871, 40.7492])).toEqual([[-73.9871, 40.7492], [-73.9857, 40.7484]]);
  });
  it("draws nothing at a transfer station or without a destination", () => {
    expect(walkFromExit(store(), pack("GC", [-73.977, 40.752]), [-73.977, 40.752])).toBeNull();
    expect(walkFromExit({ ...store(), destination: null }, final, [-73.9871, 40.7492])).toBeNull();
  });
});
