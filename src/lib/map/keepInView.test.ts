import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { keepInView, nearEdge } from "./keepInView";

const NONE = { top: 0, bottom: 0, left: 0, right: 0 };

describe("nearEdge", () => {
  it("leaves a point in the middle alone", () => {
    expect(nearEdge({ x: 160, y: 284 }, 320, 568, NONE)).toBe(false);
  });
  it("flags a point close to any edge, or off the map", () => {
    expect(nearEdge({ x: 20, y: 284 }, 320, 568, NONE)).toBe(true);
    expect(nearEdge({ x: 160, y: 560 }, 320, 568, NONE)).toBe(true);
    expect(nearEdge({ x: -40, y: 284 }, 320, 568, NONE)).toBe(true);
  });
  it("measures from the clear area, not under a panel", () => {
    // A bottom sheet covers the lower 300 px: y 260 is at the edge of what you can still see.
    const sheet = { ...NONE, bottom: 300 };
    expect(nearEdge({ x: 160, y: 140 }, 320, 568, sheet)).toBe(false);
    expect(nearEdge({ x: 160, y: 260 }, 320, 568, sheet)).toBe(true);
  });
});

/** A map 375×667 centred on (0, 0) where one degree is 1000 px. */
function fakeMap(cam: { pitch?: number; bearing?: number; moving?: boolean } = {}) {
  const easeTo = vi.fn();
  const map = {
    isMoving: () => cam.moving ?? false,
    getContainer: () => ({ clientWidth: 375, clientHeight: 667 }),
    getPadding: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    getPitch: () => cam.pitch ?? 0,
    getBearing: () => cam.bearing ?? 0,
    project: ([lon, lat]: [number, number]) => ({ x: 187.5 + lon * 1000, y: 333.5 - lat * 1000 }),
    easeTo,
  } as unknown as MapLibreMap;
  return { map, easeTo };
}

describe("keepInView while following", () => {
  it("keeps the map still while the dot moves inside the clear area", () => {
    const { map, easeTo } = fakeMap();
    for (let i = 0; i < 10; i++) keepInView(map, [i * 0.005, 0]);
    expect(easeTo).not.toHaveBeenCalled();
  });
  it("glides once, flat and north up, when the dot nears the edge", () => {
    const { map, easeTo } = fakeMap();
    expect(keepInView(map, [0.17, 0])).toBe(true);
    expect(easeTo).toHaveBeenCalledTimes(1);
    expect(easeTo.mock.calls[0][0]).toMatchObject({ center: [0.17, 0], pitch: 0, bearing: 0 });
  });
  it("levels a tilted or turned map to pitch 0 and bearing 0", () => {
    for (const cam of [{ pitch: 55 }, { bearing: 30 }, { bearing: -90 }]) {
      const { map, easeTo } = fakeMap(cam);
      keepInView(map, [0, 0]);
      expect(easeTo.mock.calls[0][0]).toMatchObject({ pitch: 0, bearing: 0 });
    }
  });
  it("treats a full turn as north up", () => {
    const { map, easeTo } = fakeMap({ bearing: 360 });
    keepInView(map, [0, 0]);
    expect(easeTo).not.toHaveBeenCalled();
  });
  it("never starts a second glide while one is under way", () => {
    const { map, easeTo } = fakeMap({ moving: true, pitch: 55 });
    expect(keepInView(map, [0.17, 0])).toBe(false);
    expect(easeTo).not.toHaveBeenCalled();
  });
});
