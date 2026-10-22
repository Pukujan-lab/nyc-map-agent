import { describe, expect, it } from "vitest";
import { artQuery, commonsFile, wallSlab } from "./logic";

describe("street art", () => {
  it("queries murals and graffiti plus nearby buildings", () => {
    const q = artQuery({ west: -74, south: 40.72, east: -73.99, north: 40.73 });
    expect(q).toContain('["artwork_type"~"^(mural|graffiti)$"](40.72,-74,40.73,-73.99)');
    expect(q).toContain("way(around.a:25)");
  });
  it("only takes Commons images", () => {
    expect(commonsFile({ wikimedia_commons: "File:Mural X.jpg" })).toBe("Mural X.jpg");
    expect(commonsFile({ image: "https://commons.wikimedia.org/wiki/File:Some_Mural.jpg" })).toBe("Some Mural.jpg");
    expect(commonsFile({ image: "https://example.com/photo.jpg" })).toBeNull();
  });
  it("snaps onto the nearest wall, outside the building", () => {
    const lat = 40.72, k = 111_320 * Math.cos((lat * Math.PI) / 180);
    // A 20 m square building whose south wall runs along lat; the mural point is 3 m south of it.
    const sq: [number, number][] = [[-74, lat], [-74 + 20 / k, lat], [-74 + 20 / k, lat + 20 / 111_320], [-74, lat + 20 / 111_320], [-74, lat]];
    const pt: [number, number] = [-74 + 10 / k, lat - 3 / 111_320];
    const ring = wallSlab(pt, [sq])!;
    expect(ring).toHaveLength(5);
    for (const p of ring.slice(0, 4)) expect(p[1]).toBeLessThan(lat); // outside (south of) the wall
    const width = Math.abs(ring[1][0] - ring[0][0]) * k;
    expect(width).toBeCloseTo(8, 1);
    expect(wallSlab(pt, [sq], 2)).toBeNull();
  });
});
