import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../app";
import { CACHE_CONTROL, matches } from "./live";

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

function feed(): Uint8Array {
  const t = Math.round(Date.now() / 1000) + 120;
  return FeedMessage.encode(
    FeedMessage.fromObject({
      header: { gtfsRealtimeVersion: "2.0", timestamp: t },
      entity: [{ id: "1", tripUpdate: { trip: { tripId: "A..N01", routeId: "A" }, stopTimeUpdate: [{ stopId: "A02N", arrival: { time: t } }] } }],
    }),
  ).finish();
}

const upstream = vi.fn((url: string) => {
  if (url.includes("lirr")) return Promise.resolve(new Response("down", { status: 503 }));
  if (url.endsWith(".json")) return Promise.resolve(new Response(JSON.stringify(url.includes("all-alerts") ? { entity: [] } : [])));
  return Promise.resolve(new Response(feed()));
});

describe("/api/transit-live", () => {
  beforeEach(() => { upstream.mockClear(); vi.stubGlobal("fetch", upstream); });
  afterEach(() => vi.unstubAllGlobals());

  it("returns every requested system and alerts in one edge-cacheable response", async () => {
    const res = await app.request("/api/v1/transit-live?systems=subway&alerts=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(CACHE_CONTROL);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=30, stale-while-revalidate=30");
    expect(res.headers.get("etag")).toMatch(/^W\/"[0-9a-f]{20}"$/);
    const body = (await res.json()) as { systems: { subway?: { trips: Array<{ route: string }> } }; alerts?: { alerts: unknown[]; outages: unknown[] }; failed?: string[] };
    expect(body.systems.subway?.trips.map((t) => t.route)).toContain("A");
    expect(body.alerts).toMatchObject({ alerts: [], outages: [] });
    expect(body.failed).toBeUndefined();
  });

  it("answers 304 with no body when If-None-Match matches, and reuses the cached feeds", async () => {
    const first = await app.request("/api/transit-live?systems=subway");
    const etag = first.headers.get("etag")!;
    const calls = upstream.mock.calls.length;
    const again = await app.request("/api/transit-live?systems=subway", { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(again.headers.get("etag")).toBe(etag);
    expect(again.headers.get("cache-control")).toBe(CACHE_CONTROL);
    expect(upstream.mock.calls.length).toBe(calls);
    const stale = await app.request("/api/transit-live?systems=subway", { headers: { "if-none-match": 'W/"nope"' } });
    expect(stale.status).toBe(200);
  });

  it("names a failed system instead of failing the whole response", async () => {
    const res = await app.request("/api/transit-live?systems=subway,lirr");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { systems: Record<string, unknown>; failed?: string[] };
    expect(Object.keys(body.systems)).toEqual(["subway"]);
    expect(body.failed).toEqual(["lirr"]);
  });

  it("rejects unknown systems and empty requests without calling MTA", async () => {
    expect((await app.request("/api/transit-live?systems=bus")).status).toBe(400);
    expect((await app.request("/api/transit-live")).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("is 502 when every requested part fails", async () => {
    expect((await app.request("/api/transit-live?systems=lirr")).status).toBe(502);
  });
});

describe("If-None-Match matching", () => {
  it("compares weakly and accepts lists and *", () => {
    expect(matches('"abc"', 'W/"abc"')).toBe(true);
    expect(matches('W/"x", W/"abc"', 'W/"abc"')).toBe(true);
    expect(matches("*", 'W/"abc"')).toBe(true);
    expect(matches(null, 'W/"abc"')).toBe(false);
    expect(matches('W/"abd"', 'W/"abc"')).toBe(false);
  });
});
