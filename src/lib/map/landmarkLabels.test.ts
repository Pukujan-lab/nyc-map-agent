import { beforeAll, describe, expect, it } from "vitest";
import { LANDMARK_LABELS_LAYER, LANDMARK_LABELS_SOURCE, LANDMARK_LAYER_PREFIX, byTierZoom, isLandmarkLayer, landmarkLabelsGeoJson } from "./landmarkLabels";
import { loadGuideLandmarks, type GuideLandmark } from "@/lib/guide/landmarkGuide";

let GUIDE_LANDMARKS: readonly GuideLandmark[] = [];
beforeAll(async () => {
  GUIDE_LANDMARKS = await loadGuideLandmarks();
});

describe("landmark layer", () => {
  it("uses the stable landmark- prefix that declutter rules skip", () => {
    expect(LANDMARK_LAYER_PREFIX).toBe("landmark-");
    expect(isLandmarkLayer(LANDMARK_LABELS_LAYER)).toBe(true);
    expect(LANDMARK_LABELS_SOURCE.startsWith(LANDMARK_LAYER_PREFIX)).toBe(true);
    expect(isLandmarkLayer("poi_label")).toBe(false);
  });

  it("gates each feature by its tier zoom", () => {
    expect(byTierZoom(["get", "name"], "")).toEqual([
      "step", ["zoom"],
      ["case", ["==", ["get", "tier"], 1], ["get", "name"], ""],
      15, ["case", ["<=", ["get", "tier"], 2], ["get", "name"], ""],
      16, ["get", "name"],
    ]);
  });

  it("places stronger landmarks first", () => {
    const fc = landmarkLabelsGeoJson(GUIDE_LANDMARKS);
    expect(fc.features).toHaveLength(GUIDE_LANDMARKS.length);
    const esb = fc.features.find((f) => f.properties.name === "Empire State Building")!;
    const tier3 = fc.features.find((f) => f.properties.tier === 3)!;
    expect(esb.properties.sort).toBeLessThan(tier3.properties.sort);
  });
});
