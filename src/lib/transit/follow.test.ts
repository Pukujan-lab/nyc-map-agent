import { describe, expect, it } from "vitest";
import { bindPreviewRelease, followMode, followRig, rememberFollowOrigin, setFollowMode, setFollowed, setPreviewing, stableHeading, stopFollowing, takeFollowRestore, type FollowSnap } from "./follow";

const cam: FollowSnap = { center: [-73.94, 40.7], zoom: 11, bearing: 20, pitch: 30 };

function reset() {
  bindPreviewRelease(null);
  setFollowed(null);
  takeFollowRestore();
}

describe("stableHeading", () => {
  it("accepts a small turn and holds a flip until it stays", () => {
    expect(stableHeading(null, 10, 0)).toEqual({ bearing: 10, streak: 0 });
    expect(stableHeading(10, 25, 0)).toEqual({ bearing: 25, streak: 0 });
    expect(stableHeading(10, 200, 0)).toEqual({ bearing: 10, streak: 1 });
    expect(stableHeading(10, 200, 1)).toEqual({ bearing: 10, streak: 2 });
    expect(stableHeading(10, 200, 2)).toEqual({ bearing: 10, streak: 3 });
    expect(stableHeading(10, 200, 3)).toEqual({ bearing: 200, streak: 0 });
  });
});

describe("followRig", () => {
  it("chase sits behind the vehicle and looks ahead", () => {
    const { eye, look } = followRig("chase", 0, 0); // heading north
    expect(eye[1]).toBeLessThan(0);
    expect(look[1]).toBeGreaterThan(0);
  });
  it("side sits to the right of the heading", () => {
    expect(followRig("side", 0, 0).eye[0]).toBeGreaterThan(0);
  });
  it("overhead is high above, cab just above the deck", () => {
    expect(followRig("overhead", 90, 8).eye[2]).toBeGreaterThan(300);
    expect(followRig("cab", 90, 8).eye[2]).toBeCloseTo(11.2);
  });
});

describe("stop following", () => {
  it("gives back the camera from before the follow", () => {
    reset();
    rememberFollowOrigin(cam);
    setFollowed("subway:A");
    stopFollowing();
    expect(takeFollowRestore()).toEqual({ restore: true, cam });
  });

  it("a drag or Esc stop leaves the camera where it is", () => {
    reset();
    rememberFollowOrigin(cam);
    setFollowed("subway:A");
    setFollowed(null);
    expect(takeFollowRestore()).toEqual({ restore: false, cam: null });
  });

  it("lets a new vehicle stop the trip preview, and a release does not", () => {
    reset();
    let released = 0;
    bindPreviewRelease(() => { released += 1; });
    setFollowed("subway:A");
    setFollowed("subway:A");
    setFollowed(null);
    expect(released).toBe(1);
    setFollowed("subway:1");
    expect(released).toBe(2);
  });

  it("keeps the first view when follow moves to another train", () => {
    reset();
    rememberFollowOrigin(cam);
    setFollowed("subway:A");
    rememberFollowOrigin({ ...cam, zoom: 17, pitch: 70 });
    setFollowed("subway:1");
    stopFollowing();
    expect(takeFollowRestore().cam?.zoom).toBe(11);
  });
});

describe("trip preview cameras", () => {
  it("a preview on the map offers the follow cameras, and a picked one stays until changed", () => {
    setPreviewing(true);
    setFollowMode("side");
    expect(followMode()).toBe("side");
    setPreviewing(true);
    expect(followMode()).toBe("side");
    setPreviewing(false);
    setFollowMode("chase");
  });
});
