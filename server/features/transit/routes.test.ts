import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, decodePolyline, loadBusStops } from "./routes";

describe("bus sheet endpoints", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("decodes Google encoded polylines to [lon, lat]", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  });
  it("validates route and vehicle before calling Bus Time", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "k");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await GET(new Request("http://x/api/transit/bus-route?route=../../etc"))).status).toBe(400);
    expect((await GET(new Request("http://x/api/transit/bus-trip?vehicle=a%2Fb%3Fc"))).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("is unavailable without a Bus Time key", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "");
    expect((await GET(new Request("http://x/api/transit/bus-route?route=M42"))).status).toBe(404);
  });
  it("slims SIRI into headsign + upcoming stops", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ Siri: { ServiceDelivery: { VehicleMonitoringDelivery: [{ VehicleActivity: [{ MonitoredVehicleJourney: {
      PublishedLineName: "M42", DestinationName: "WEST SIDE PIER", DirectionRef: "1",
      OnwardCalls: { OnwardCall: [{ StopPointRef: "MTA_1", StopPointName: "W 42 ST/11 AV", ExpectedArrivalTime: "2026-10-21T16:00:00-04:00", Extensions: { Distances: { PresentableDistance: "1 stop away" } } }] },
    } }] }] } } })))));
    const body: unknown = await (await GET(new Request("http://x/api/transit/bus-trip?vehicle=MTA%20NYCT_9999"))).json();
    expect(body).toEqual({ found: true, route: "M42", destination: "WEST SIDE PIER", dir: "1", calls: [{ id: "MTA_1", name: "W 42 ST/11 AV", eta: 1792612800, away: "1 stop away" }] });
  });
});

describe("bus-stops", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("rejects points outside NYC", async () => {
    vi.stubEnv("MTA_BUSTIME_KEY", "k");
    expect((await GET(new Request("http://x/api/transit/bus-stops?lat=0&lon=0"))).status).toBe(400);
  });
  it("maps OBA stops to names and route short names", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(
      new Response(JSON.stringify({ data: { list: [{ id: "MTA_1", name: "GRAND ST/ESSEX ST", lat: 40.718, lon: -73.988, direction: "W", routeIds: ["MTA NYCT_M14D+", "MTA NYCT_B39"] }], references: { routes: [{ id: "MTA NYCT_M14D+", shortName: "M14D-SBS" }, { id: "MTA NYCT_B39", shortName: "B39" }] } } })))));
    const { stops } = await loadBusStops("k", 40.718, -73.988);
    expect(stops).toEqual([{ id: "MTA_1", name: "GRAND ST/ESSEX ST", lat: 40.718, lon: -73.988, dir: "W", routes: ["B39", "M14D-SBS"] }]);
  });
});
