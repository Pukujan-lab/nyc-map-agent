import { beforeEach, describe, expect, it, vi } from "vitest";

const octoQuery = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>();
vi.mock("../../../api/_lib/octo", () => ({ octoQuery: (sql: string, params: unknown[]) => octoQuery(sql, params), OctoError: class extends Error {} }));

const { GET } = await import("./routes");
const { app } = await import("../../app");
const { EventsResponse } = await import("./schema");

const row = {
  id: "permitted:979421",
  title: "MECPS PEP RALLY",
  kind: "other",
  start_at: "2026-10-23T15:00:00",
  end_at: "2026-10-23T18:30:00",
  location: { type: "LineString", coordinates: [[-73.953523, 40.667341], [-73.950753, 40.66719]] },
  address: "Carroll Street between Rogers Avenue and Nostrand Avenue, Brooklyn",
  source: "nyc-permitted-events",
  url: "https://data.cityofnewyork.us/City-Government/NYC-Permitted-Event-Information/tvpp-9vvx",
};

beforeEach(() => {
  octoQuery.mockReset();
  octoQuery.mockResolvedValue({ rows: [row] });
});

describe("GET /api/events", () => {
  it("returns a typed GeoJSON FeatureCollection with New York offsets", async () => {
    const res = await GET(new Request("http://x/api/events?bbox=-74.02,40.6,-73.9,40.8&kind=fair,other&from=2026-10-23T00:00:00-04:00&to=2026-10-24T00:00:00-04:00"));
    expect(res.status).toBe(200);
    const body = EventsResponse.parse(await res.json());
    expect(body.features[0]).toMatchObject({ id: row.id, geometry: { type: "LineString" }, properties: { start: "2026-10-23T15:00:00-04:00", kind: "other" } });
    const params = octoQuery.mock.calls[0][1];
    expect(params[2]).toEqual(["fair", "other"]);
    expect(params.slice(3)).toEqual([-74.02, 40.6, -73.9, 40.8]);
  });

  it("defaults to the next 7 days and no filters", async () => {
    await GET(new Request("http://x/api/events"));
    const [from, to, kinds, w] = octoQuery.mock.calls[0][1] as [string, string, unknown, unknown];
    expect(Date.parse(to) - Date.parse(from)).toBe(7 * 86_400_000);
    expect(kinds).toBeNull();
    expect(w).toBeNull();
  });

  it.each([
    "kind=concert",
    "bbox=1,2,3",
    "bbox=-73.9,40.6,-74.0,40.8",
    "from=tomorrow",
    "from=2026-10-23T00:00:00-04:00&to=2026-10-22T00:00:00-04:00",
    "from=2026-10-01T00:00:00-04:00&to=2026-12-01T00:00:00-05:00",
  ])("rejects %s with 400", async (qs) => {
    const res = await GET(new Request(`http://x/api/events?${qs}`));
    expect(res.status).toBe(400);
    expect(octoQuery).not.toHaveBeenCalled();
  });

  it("is mounted on the Hono app at /api/v1/events with zod validation", async () => {
    expect((await app.request("/api/v1/events?kind=fair")).status).toBe(200);
    expect((await app.request("/api/v1/events?kind=nope")).status).toBe(400);
    const spec = (await (await app.request("/api/v1/openapi.json")).json()) as { paths: Record<string, unknown> };
    expect(spec.paths["/api/v1/events"]).toBeDefined();
  });

  it("returns 502 when Octo fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    octoQuery.mockRejectedValueOnce(new Error("down"));
    expect((await GET(new Request("http://x/api/events"))).status).toBe(502);
  });
});
