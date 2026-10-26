import { describe, expect, it } from "vitest";
import { exitBounds, exitToGeoJson, type ExitView } from "./exitLayer";

const v: ExitView = {
  exit: { at: [-73.988, 40.749], label: "NE exit on West 34 Street" },
  destination: { at: [-73.9857, 40.7484], label: "Empire State Building" },
  path: [[-73.988, 40.749], [-73.987, 40.7487], [-73.9857, 40.7484]],
};

describe("exit on the map", () => {
  it("draws the walk, the place and the exit", () => {
    const g = exitToGeoJson(v);
    expect(g.features.map((f) => String(f.properties?.kind))).toEqual(["path", "dest", "exit"]);
    expect(g.features[2].properties?.name).toBe("NE exit on West 34 Street");
  });

  it("grows each label toward the other point, away from the screen edges", () => {
    const g = exitToGeoJson(v);
    expect(g.features[2].properties?.anchor).toBe("top-left");
    expect(g.features[1].properties?.anchor).toBe("top-right");
    const flipped = exitToGeoJson({ ...v, exit: v.destination, destination: v.exit });
    expect(flipped.features[2].properties?.anchor).toBe("top-right");
  });

  it("frames you too when your location is known", () => {
    expect(exitBounds(v, null)).toEqual([[-73.988, 40.7484], [-73.9857, 40.749]]);
    expect(exitBounds(v, [-73.99, 40.75])).toEqual([[-73.99, 40.7484], [-73.9857, 40.75]]);
  });
});
