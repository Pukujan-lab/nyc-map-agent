import { describe, expect, it } from "vitest";
import { PHOTO_PITCH, PHOTO_ZOOM, photoCamera } from "./photoGlide";

describe("photo glide camera (#10)", () => {
  it("stands at the photo, street-level and tilted, facing the photo's way", () => {
    expect(photoCamera({ lng: -73.98, lat: 40.75 }, 90)).toEqual({ lon: -73.98, lat: 40.75, zoom: PHOTO_ZOOM, pitch: PHOTO_PITCH, bearing: 90, glide: true });
  });

  it("keeps the heading within one turn", () => {
    expect(photoCamera({ lng: 0, lat: 0 }, -30).bearing).toBe(330);
    expect(photoCamera({ lng: 0, lat: 0 }, 400).bearing).toBe(40);
  });
});
