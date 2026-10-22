import { describe, expect, it } from "vitest";
import { followRig, rememberFollowOrigin, setFollowed, stopFollowing, takeFollowRestore, type FollowSnap } from "./follow";

const cam: FollowSnap = { center: [-73.94, 40.7], zoom: 11, bearing: 20, pitch: 30 };

function reset() {
  setFollowed(null);
  takeFollowRestore();
}

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
