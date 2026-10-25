import { describe, expect, it } from "vitest";
import type { GuideLandmark } from "@/lib/guide/landmarkGuide";
import { nextCheckpoint } from "./checkpoints";
const here = { lon: -73.98, lat: 40.75 };
const mark: GuideLandmark = { ...here, lat: 40.751, id: "a", name: "Big screens", category: "square", borough: "Manhattan", tier: 1, sitelinks: 10, picture: { url: "photo", page: "credit", file: "f", license: "CC0", artist: "A" } };
describe("walking checkpoints", () => {
  it("requires a photo and an unconfirmed landmark ahead", () => {
    expect(nextCheckpoint(here, 0, [mark], [])?.landmark.id).toBe("a");
    expect(nextCheckpoint(here, 0, [mark], ["a"])).toBeNull();
    expect(nextCheckpoint(here, 180, [mark], [])).toBeNull();
    expect(nextCheckpoint(here, 0, [{ ...mark, picture: undefined }], [])).toBeNull();
  });
  it("does not use distant landmarks", () => {
    expect(nextCheckpoint(here, 0, [{ ...mark, lat: 40.8 }], [])).toBeNull();
  });
});
