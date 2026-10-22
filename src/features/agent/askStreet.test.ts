import { describe, expect, it } from "vitest";
import type { StaticSystem } from "@/features/transit/model";
import { requestBody } from "./schema";
import { buildStreetContext, nearestStop } from "./streetContext";
import { FATAL_MIC, shouldListen } from "./useHandsFree";

const sys = {
  system: "subway",
  stations: { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-73.9869, 40.7553] }, properties: { id: "127", name: "Times Sq-42 St", routes: "1 2 3" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-73.9772, 40.7527] }, properties: { id: "631", name: "Grand Central-42 St", routes: "4 5 6" } },
  ] },
  entrances: { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-73.9866, 40.7559] }, properties: { id: "127", name: "7 Av & W 43 St", kind: "Stair" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-73.9875, 40.7546] }, properties: { id: "127", name: "Broadway & W 41 St", kind: "Elevator" } },
  ] },
} as unknown as StaticSystem;

describe("street-view Ask context", () => {
  it("names the nearest station and its nearest entrance", () => {
    const n = nearestStop(sys, -73.9865, 40.756);
    expect(n.station).toMatch(/^Times Sq-42 St \(\d+ m\)$/);
    expect(n.entrance).toMatch(/Stair at 7 Av & W 43 St/);
  });
  it("is empty far from any station or without data", () => {
    expect(nearestStop(sys, -74.2, 40.5)).toEqual({ station: null, entrance: null });
    expect(nearestStop(null, -73.98, 40.75)).toEqual({ station: null, entrance: null });
  });
  it("builds a context the request schema accepts", () => {
    const context = buildStreetContext({ lon: -73.9865, lat: 40.756, heading: -90, followedTrain: "subway:A" }, sys);
    expect(context.heading).toBe(270);
    const parsed = requestBody.parse({ messages: [{ role: "user", content: "which exit?" }], context });
    expect(parsed.context?.nearestStation).toContain("Times Sq");
    expect(parsed.context?.followedTrain).toBe("subway:A");
  });
});

describe("hands-free", () => {
  const idle = { on: true, supported: true, listening: false, busy: false, speaking: false };
  it("listens again only when idle", () => {
    expect(shouldListen(idle)).toBe(true);
    expect(shouldListen({ ...idle, on: false })).toBe(false);
    expect(shouldListen({ ...idle, supported: false })).toBe(false);
    expect(shouldListen({ ...idle, busy: true })).toBe(false);
    expect(shouldListen({ ...idle, listening: true })).toBe(false);
  });
  it("keeps the mic off while the app is speaking", () => {
    expect(shouldListen({ ...idle, speaking: true })).toBe(false);
  });
  it("stops on a blocked or missing mic, not on silence", () => {
    expect(FATAL_MIC.test("Microphone access is blocked — type your question instead.")).toBe(true);
    expect(FATAL_MIC.test("No microphone was found. You can still type your question.")).toBe(true);
    expect(FATAL_MIC.test("I didn't catch that. Try again, a little closer to the mic.")).toBe(false);
  });
});
