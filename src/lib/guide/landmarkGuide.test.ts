import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  loadGuideLandmarks,
  landmarksNear,
  STREET_LEVEL_RANGE_M,
  TIER_MIN_ZOOM,
  bearingTo,
  compassDirection,
  describeGuide,
  landmarksAtZoom,
  pickGuideLandmarks,
  relativeDirection,
  turnFrom,
  type GuideLandmark,
} from "./landmarkGuide";

const mk = (over: Partial<GuideLandmark> & Pick<GuideLandmark, "id" | "lon" | "lat">): GuideLandmark => ({
  name: over.id,
  category: "tower",
  borough: "Manhattan",
  tier: 1,
  sitelinks: 50,
  ...over,
});

// Herald Square, a few blocks south-west of the Empire State Building.
const HERALD = { lon: -73.98777, lat: 40.74967 };

let GUIDE_LANDMARKS: readonly GuideLandmark[] = [];

describe("lazy list", () => {
  it("returns [] before the list has loaded, then answers once it has", async () => {
    vi.resetModules();
    const fresh = await import("./landmarkGuide");
    expect(fresh.pickGuideLandmarks(HERALD, 120)).toEqual([]);
    expect(fresh.guideLandmarks()).toEqual([]);
    await fresh.loadGuideLandmarks();
    expect(fresh.pickGuideLandmarks(HERALD, 120)[0]?.landmark.name).toBe("Empire State Building");
  });
});

describe("with the list loaded", () => {
  beforeAll(async () => {
    GUIDE_LANDMARKS = await loadGuideLandmarks();
  });

describe("relative direction", () => {
  it("names the side and how far round", () => {
    expect(relativeDirection(0)).toBe("ahead");
    expect(relativeDirection(-30)).toBe("ahead, slightly left");
    expect(relativeDirection(30)).toBe("ahead, slightly right");
    expect(relativeDirection(90)).toBe("to your right");
    expect(relativeDirection(-140)).toBe("behind you, on the left");
    expect(relativeDirection(179)).toBe("behind you");
  });

  it("wraps across north", () => {
    expect(turnFrom(350, 10)).toBe(20);
    expect(turnFrom(10, 350)).toBe(-20);
    expect(bearingTo({ lon: 0, lat: 40 }, { lon: 0, lat: 41 })).toBeCloseTo(0);
    expect(bearingTo({ lon: 0, lat: 40 }, { lon: 1, lat: 40 })).toBeCloseTo(90);
    expect(compassDirection(44)).toBe("to the north-east");
  });
});

describe("pickGuideLandmarks", () => {
  it("names the Empire State Building from Herald Square, facing up Broadway", () => {
    // Broadway runs about 29 degrees east of north here; the tower is to the south-east.
    const [first] = pickGuideLandmarks(HERALD, 120);
    expect(first?.landmark.name).toBe("Empire State Building");
    expect(first?.text).toMatch(/^Empire State Building (ahead|ahead, slightly (left|right))$/);
  });

  it("says where it is with the compass when the heading is unknown", () => {
    const picks = pickGuideLandmarks(HERALD, null);
    expect(picks[0]?.landmark.name).toBe("Empire State Building");
    expect(picks[0]?.direction).toBe("to the south-east");
    expect(picks[0]?.turn).toBeNull();
  });

  it("prefers what you face over an equally known landmark behind you", () => {
    const list = [mk({ id: "north", lon: 0, lat: 0.005 }), mk({ id: "south", lon: 0, lat: -0.005 })];
    expect(pickGuideLandmarks({ lon: 0, lat: 0 }, 0, { list, max: 1 })[0]?.landmark.id).toBe("north");
    expect(pickGuideLandmarks({ lon: 0, lat: 0 }, 180, { list, max: 1 })[0]?.landmark.id).toBe("south");
  });

  it("returns at most two, in clearly different directions", () => {
    const list = [
      mk({ id: "a", lon: 0, lat: 0.005 }),
      mk({ id: "b", lon: 0.0005, lat: 0.005, sitelinks: 40 }), // same line of sight as a
      mk({ id: "c", lon: 0.006, lat: 0, sitelinks: 30 }),
    ];
    const picks = pickGuideLandmarks({ lon: 0, lat: 0 }, 0, { list });
    expect(picks.map((p) => p.landmark.id)).toEqual(["a", "c"]);
    expect(describeGuide(picks)).toBe("a ahead; c to your right");
  });

  it("skips landmarks beyond their sight range, which is longer for towers than for a museum", () => {
    const list = [mk({ id: "museum", category: "museum", tier: 3, lon: 0, lat: 0.009 }), mk({ id: "tower", tier: 2, lon: 0, lat: 0.02 })];
    expect(pickGuideLandmarks({ lon: 0, lat: 0 }, 0, { list }).map((p) => p.landmark.id)).toEqual(["tower"]);
    expect(pickGuideLandmarks({ lon: 0, lat: 0.1 }, 0, { list })).toEqual([]);
  });

  it("caps distance at street level, so a far tower drops out", () => {
    // A tier-1 tower ~2.2 km north: inside its 4 km sight range, outside the street-level cap.
    const list = [mk({ id: "far", lon: 0, lat: 0.02 }), mk({ id: "near", category: "museum", lon: 0.005, lat: 0 })];
    expect(pickGuideLandmarks({ lon: 0, lat: 0 }, 0, { list }).map((p) => p.landmark.id)).toEqual(["far", "near"]);
    expect(pickGuideLandmarks({ lon: 0, lat: 0 }, 0, { list, maxDistanceM: STREET_LEVEL_RANGE_M }).map((p) => p.landmark.id)).toEqual(["near"]);
    expect(landmarksNear({ lon: 0, lat: 0 }, STREET_LEVEL_RANGE_M, list).map((l) => l.id)).toEqual(["near"]);
  });

  it("keeps JFK off the street-level map in Times Square", () => {
    const near = landmarksNear({ lon: -73.9857, lat: 40.758 }, STREET_LEVEL_RANGE_M).map((l) => l.name);
    expect(near).toContain("Times Square");
    expect(near).not.toContain("John F. Kennedy International Airport");
  });

  it("says you are there when standing on it", () => {
    const list = [mk({ id: "here", name: "Unisphere", category: "monument", lon: 0, lat: 0 })];
    expect(pickGuideLandmarks({ lon: 0, lat: 0.0001 }, 90, { list })[0]?.text).toBe("You are at Unisphere");
  });
});

describe("density by zoom", () => {
  it("shows a few citywide and more as you zoom in", () => {
    const city = landmarksAtZoom(10).length;
    const mid = landmarksAtZoom(12.5).length;
    const near = landmarksAtZoom(15).length;
    expect(city).toBeGreaterThanOrEqual(10);
    expect(city).toBeLessThanOrEqual(45);
    expect(mid).toBeGreaterThan(city);
    expect(near).toBe(GUIDE_LANDMARKS.length);
    expect(landmarksAtZoom(TIER_MIN_ZOOM[1] - 0.1)).toEqual([]);
  });

  it("covers all five boroughs at the citywide zoom", () => {
    const boroughs = new Set(landmarksAtZoom(TIER_MIN_ZOOM[1]).map((l) => l.borough));
    expect([...boroughs].sort()).toEqual(["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"]);
  });
});

describe("generated data", () => {
  it("has unique ids, NYC coordinates and a licence on every picture", () => {
    expect(new Set(GUIDE_LANDMARKS.map((l) => l.id)).size).toBe(GUIDE_LANDMARKS.length);
    for (const l of GUIDE_LANDMARKS) {
      expect(l.lon).toBeGreaterThan(-74.27);
      expect(l.lon).toBeLessThan(-73.68);
      expect(l.lat).toBeGreaterThan(40.49);
      expect(l.lat).toBeLessThan(40.92);
      if (l.picture) {
        expect(l.picture.license).not.toBe("");
        expect(l.picture.artist).not.toBe("");
        expect(l.picture.url).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//);
      }
    }
  });

  it("keeps the hand-picked bridges and ferry terminal, from mid zoom", () => {
    const byId = new Map(GUIDE_LANDMARKS.map((l) => [l.id, l]));
    expect(byId.get("Q1035131")).toMatchObject({ name: "Hell Gate Bridge", borough: "Queens", category: "bridge", tier: 2 });
    expect(byId.get("Q125450")).toMatchObject({ name: "Robert F. Kennedy (Triborough) Bridge", borough: "Queens", tier: 2 });
    expect(byId.get("Q5927015")).toMatchObject({ name: "St. George Ferry Terminal", borough: "Staten Island", category: "station", tier: 2 });
    const at12 = new Set(landmarksAtZoom(12).map((l) => l.id));
    expect(["Q1035131", "Q125450", "Q5927015"].every((id) => at12.has(id))).toBe(true);
    expect(landmarksAtZoom(11.9).some((l) => l.id === "Q5927015")).toBe(false);
  });
});
});
