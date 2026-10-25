import { describe, expect, it } from "vitest";
import { ZoomKeeper } from "./follow";

describe("zoom while a camera drives the map", () => {
  it("keeps the person's zoom as an offset on top of the camera", () => {
    const k = new ZoomKeeper();
    expect(k.next(15, 12)).toBe(15); // first frame: the camera's zoom
    expect(k.next(15, 15)).toBe(15); // nobody touched it
    expect(k.next(15.2, 16)).toBe(16.2); // zoomed in by 1 since the last frame
    expect(k.next(15.4, 16.2)).toBe(16.4); // the offset stays
    k.reset();
    expect(k.next(14, 20)).toBe(14);
  });
});
