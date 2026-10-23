import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { busStopsShown, pickAt, setBusStopsShown, setPickTargets, subscribeBusStops } from "./streetPick";

// A fake eye-level map: looking north, horizon at y = 300, ground point 10 m ahead at y = 470.
const map = {
  getCenter: () => ({ lng: -73.988, lat: 40.718 }),
  getBearing: () => 0,
  project: ([lng, lat]: [number, number]) => {
    const north = (lat - 40.718) * 111_320;
    if (north > 1000) return { x: 640, y: 300 };
    const east = (lng + 73.988) * 111_320 * Math.cos((40.718 * Math.PI) / 180);
    const d = Math.max(north + 2, 0.1);
    return { x: 640 + (east / d) * 700, y: 300 + (EYE * 700) / d };
  },
} as unknown as MapLibreMap;
const EYE = 1.7;

describe("pickAt", () => {
  setPickTargets([{ kind: "restroom", id: "r1", lng: -73.988, lat: 40.718 + 8 / 111_320, h: 2.4, props: { name: "Seward Park" } }]);
  it("hits the kiosk body above its base", () => {
    expect(pickAt(map, 640, 280)?.id).toBe("r1");
    expect(pickAt(map, 640, 400)?.id).toBe("r1");
  });
  it("misses beside it and above it", () => {
    expect(pickAt(map, 900, 400)).toBeNull();
    expect(pickAt(map, 640, 150)).toBeNull();
  });
});

describe("bus stop poles", () => {
  it("notifies the furniture layer when the switch changes", () => {
    const seen: boolean[] = [];
    const stop = subscribeBusStops(() => seen.push(busStopsShown()));
    setBusStopsShown(false);
    setBusStopsShown(false);
    setBusStopsShown(true);
    stop();
    expect(seen).toEqual([false, true]);
    expect(busStopsShown()).toBe(true);
  });
});
