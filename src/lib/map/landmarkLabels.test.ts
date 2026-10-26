import { beforeAll, describe, expect, it } from "vitest";
import { LANDMARK_LABELS_LAYER, LANDMARK_LABELS_SOURCE, LANDMARK_LAYER_PREFIX, byTierZoom, guideLandmarkNamed, isLandmarkLayer, landmarkAt, landmarkLabelsGeoJson } from "./landmarkLabels";
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

describe("landmarkAt", () => {
  it("is null when the landmark layer is not on the map yet", () => {
    const map = { getLayer: () => undefined, queryRenderedFeatures: () => [] } as unknown as Parameters<typeof landmarkAt>[0];
    expect(landmarkAt(map, { x: 1, y: 1 })).toBeNull();
  });
  it("finds the tapped landmark, picture included, and matches a hero model by name", () => {
    const first = GUIDE_LANDMARKS[0];
    const map = { getLayer: () => ({}), queryRenderedFeatures: () => [{ properties: { id: first.id } }] } as unknown as Parameters<typeof landmarkAt>[0];
    expect(landmarkAt(map, { x: 1, y: 1 })?.name).toBe(first.name);
    expect(guideLandmarkNamed("empire state building")?.picture?.url).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
  });
});
