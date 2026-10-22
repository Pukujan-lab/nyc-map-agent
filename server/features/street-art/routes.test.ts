import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./routes";

const lat = 40.72, k = 111_320 * Math.cos((lat * Math.PI) / 180);
const sq = [[-74, lat], [-74 + 20 / k, lat], [-74 + 20 / k, lat + 20 / 111_320], [-74, lat + 20 / 111_320], [-74, lat]].map(([lon, la]) => ({ lon, lat: la }));

describe("GET /api/street-art", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rejects a big bbox", async () => {
    const r = await GET(new Request("http://x/api/street-art?west=-74.1&south=40.6&east=-73.9&north=40.8"));
    expect(r.status).toBe(400);
  });
  it("snaps a mural to its wall and drops non-Commons images", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ elements: [
      { type: "node", id: 1, lat: lat - 3 / 111_320, lon: -74 + 10 / k, tags: { tourism: "artwork", artwork_type: "mural", name: "Wall", image: "https://example.com/x.jpg" } },
      { type: "way", id: 2, geometry: sq, tags: { building: "yes" } },
    ] })))));
    const r = await GET(new Request("http://x/api/street-art?west=-74.001&south=40.719&east=-73.999&north=40.721"));
    const j = (await r.json()) as { features: Array<{ properties: unknown; geometry: { coordinates: unknown[][] } }> };
    expect(j.features).toHaveLength(1);
    expect(j.features[0].properties).toMatchObject({ name: "Wall", kind: "mural", img: null });
    expect(j.features[0].geometry.coordinates[0]).toHaveLength(5);
  });
});
