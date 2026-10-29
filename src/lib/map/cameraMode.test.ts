import { beforeEach, describe, expect, it } from "vitest";
import { getCameraMode, INITIAL_CAMERA, nextCameraMode, resetCameraModeForTests, sendCamera, type CameraEvent, type CameraMode } from "./cameraMode";

const run = (events: CameraEvent[], from: CameraMode = INITIAL_CAMERA) => events.reduce((m, e) => nextCameraMode(m, e, 1), from);

describe("nextCameraMode", () => {
  it("walks and comes back to the map", () => {
    expect(run([{ type: "street", target: { lon: 1, lat: 2 } }])).toEqual({ kind: "street", target: { lon: 1, lat: 2, nonce: 1 }, back: "map" });
    expect(run([{ type: "street" }, { type: "leave-street" }])).toEqual({ kind: "map" });
  });

  it("a view picked while walking leaves the walk", () => {
    expect(run([{ type: "street" }, { type: "view" }])).toEqual({ kind: "map" });
  });

  it("a view picked during guidance stays: guidance only keeps you centred", () => {
    expect(run([{ type: "guide" }, { type: "view" }])).toEqual({ kind: "guide", centred: true, tilt: false });
  });

  it("Top or Aerial from a street walk taken during guidance keeps guidance, untilted", () => {
    expect(run([{ type: "guide" }, { type: "street" }, { type: "view" }])).toEqual({ kind: "guide", centred: true, tilt: false });
  });

  it("leaving a street walk taken during guidance resumes guidance", () => {
    const walked = run([{ type: "guide" }, { type: "street" }]);
    expect(walked).toMatchObject({ kind: "street", back: "guide" });
    expect(nextCameraMode(walked, { type: "leave-street" })).toEqual({ kind: "guide", centred: true, tilt: true });
  });

  it("panning stops centring until Recenter", () => {
    const panned = run([{ type: "guide" }, { type: "pan" }]);
    expect(panned).toEqual({ kind: "guide", centred: false, tilt: true });
    expect(nextCameraMode(panned, { type: "recenter" })).toEqual({ kind: "guide", centred: true, tilt: true });
  });

  it("stopping guidance during a walk leaves the walk on, returning to the map", () => {
    expect(run([{ type: "guide" }, { type: "street" }, { type: "stop-guide" }, { type: "leave-street" }])).toEqual({ kind: "map" });
  });

  it("reset shows the city without ending guidance", () => {
    expect(run([{ type: "street" }, { type: "reset" }])).toEqual({ kind: "map" });
    expect(run([{ type: "guide" }, { type: "reset" }])).toEqual({ kind: "guide", centred: false, tilt: false });
  });

  it("events that change nothing return the same mode", () => {
    const map = INITIAL_CAMERA;
    for (const type of ["leave-street", "view", "reset", "stop-guide", "pan", "recenter"] as const) {
      expect(nextCameraMode(map, { type })).toBe(map);
    }
  });
});

describe("sendCamera", () => {
  beforeEach(resetCameraModeForTests);

  it("updates the shared mode", () => {
    sendCamera({ type: "guide" });
    sendCamera({ type: "view" });
    expect(getCameraMode()).toEqual({ kind: "guide", centred: true, tilt: false });
  });
});
