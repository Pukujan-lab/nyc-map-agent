import { afterEach, describe, expect, it, vi } from "vitest";
import { sharedCoords, startSharing, stopSharing } from "./sharedLocation";

type Ok = (p: { coords: { longitude: number; latitude: number } }) => void;
type Fail = () => void;

function fakeGeo() {
  let ok: Ok = () => {};
  let fail: Fail = () => {};
  const g = {
    watchPosition: vi.fn((a: Ok, b: Fail) => { ok = a; fail = b; return 7; }),
    clearWatch: vi.fn(),
  };
  return { g, ok: (lon: number, lat: number) => ok({ coords: { longitude: lon, latitude: lat } }), fail: () => fail() };
}

describe("shared location", () => {
  afterEach(() => stopSharing(null));

  it("asks nothing until started, then shares the exact position", async () => {
    const f = fakeGeo();
    expect(f.g.watchPosition).not.toHaveBeenCalled();
    expect(sharedCoords()).toBeNull();
    const p = startSharing(f.g as unknown as Geolocation);
    f.ok(-73.990312, 40.735901);
    await expect(p).resolves.toEqual({ lon: -73.990312, lat: 40.735901 });
    expect(sharedCoords()).toEqual({ lon: -73.990312, lat: 40.735901 });
  });

  it("stop sharing clears the watch and forgets the position", async () => {
    const f = fakeGeo();
    const p = startSharing(f.g as unknown as Geolocation);
    f.ok(-74, 40.7);
    await p;
    stopSharing(f.g as unknown as Geolocation);
    expect(f.g.clearWatch).toHaveBeenCalledWith(7);
    expect(sharedCoords()).toBeNull();
    f.ok(-74.1, 40.8);
    expect(sharedCoords()).toBeNull();
  });

  it("a refusal leaves nothing shared", async () => {
    const f = fakeGeo();
    const p = startSharing(f.g as unknown as Geolocation);
    f.fail();
    await expect(p).resolves.toBeNull();
    expect(sharedCoords()).toBeNull();
  });
});
