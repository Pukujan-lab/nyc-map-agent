import { describe, expect, it } from "vitest";
import { distanceLabel, whereYouAre } from "./where";
import type { Station } from "./exits";

const station: Station = { id: "A", name: "Flushing Av", at: [-73.9502, 40.7003] };
const exitAt: [number, number] = [-73.9496, 40.7006];
const off = { status: "off" as const, coords: null };
const at = (lon: number, lat: number) => ({ status: "on" as const, coords: { lon, lat } });

describe("whereYouAre", () => {
  it("asks when location is not shared", () => {
    expect(whereYouAre({ station, exitAt, shared: off, confirmed: false, nearest: null })).toEqual({ kind: "ask", blocked: false });
    expect(whereYouAre({ station, exitAt, shared: { status: "denied", coords: null }, confirmed: false, nearest: null })).toEqual({ kind: "ask", blocked: true });
  });
  it("waits while the browser looks", () => {
    expect(whereYouAre({ station, exitAt, shared: { status: "asking", coords: null }, confirmed: false, nearest: null }).kind).toBe("finding");
  });
  it("takes your word without a shared location", () => {
    expect(whereYouAre({ station, exitAt, shared: off, confirmed: true, nearest: null })).toEqual({ kind: "here", from: null, toExitM: null });
  });
  it("is here near the station, with the distance from you to the exit", () => {
    const w = whereYouAre({ station, exitAt, shared: at(-73.9503, 40.7002), confirmed: false, nearest: null });
    expect(w.kind).toBe("here");
    if (w.kind === "here") {
      expect(w.from).toEqual([-73.9503, 40.7002]);
      expect(w.toExitM).toBeGreaterThan(40);
      expect(w.toExitM).toBeLessThan(80);
    }
  });
  it("says you are elsewhere, and names the station by you", () => {
    const nearest: Station = { id: "B", name: "Myrtle Av", at: [-73.9353, 40.6973] };
    const w = whereYouAre({ station, exitAt, shared: at(-73.9353, 40.6973), confirmed: false, nearest });
    expect(w).toMatchObject({ kind: "far", nearest });
    if (w.kind === "far") expect(w.metres).toBeGreaterThan(1000);
  });
  it("does not offer the same station as the nearest", () => {
    const w = whereYouAre({ station, exitAt, shared: at(-73.94, 40.70), confirmed: false, nearest: station });
    expect(w).toMatchObject({ kind: "far", nearest: null });
  });
  it("lets your word win over a stale fix", () => {
    expect(whereYouAre({ station, exitAt, shared: at(-73.90, 40.70), confirmed: true, nearest: null })).toEqual({ kind: "here", from: null, toExitM: null });
  });
});

describe("distanceLabel", () => {
  it("rounds metres and switches to km", () => {
    expect(distanceLabel(347)).toBe("350 m");
    expect(distanceLabel(1240)).toBe("1.2 km");
  });
});
