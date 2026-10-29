import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedNumbers, noteSource, numbersIn, SourceLedger, withSources } from "./freshness";
import { publicRestrooms, serviceAlerts } from "./services";

afterEach(() => vi.unstubAllGlobals());

const NOW = Date.parse("2026-10-23T20:00:00Z");

describe("source ledger", () => {
  it("keeps the oldest known time per source and marks stale past each source's threshold", () => {
    const l = new SourceLedger();
    l.note("mta-alerts", NOW - 60_000);
    l.note("mta-alerts", NOW - 3 * 60_000); // older reading wins: the answer is only as fresh as its oldest input
    l.note("forecast", NOW - 60 * 60_000);
    l.note("restrooms", Date.parse("2025-06-27T13:37:17Z"));
    const byId = Object.fromEntries(l.list(NOW).map((s) => [s.id, s]));
    expect(byId["mta-alerts"]).toMatchObject({ label: "MTA service alerts", asOf: new Date(NOW - 3 * 60_000).toISOString(), stale: true });
    expect(byId.forecast.stale).toBe(false);
    expect(byId.restrooms.stale).toBe(true);
    expect(byId.restrooms.note).toMatch(/out of date/);
  });

  it("a known time replaces an unknown one; an unknown age is never called stale", () => {
    const l = new SourceLedger();
    l.note("crashes", null);
    expect(l.list(NOW)[0]).toMatchObject({ asOf: null, stale: false });
    expect(l.list(NOW)[0].note).toMatch(/months behind/);
    l.note("crashes", NOW);
    expect(l.list(NOW)[0].asOf).toBe(new Date(NOW).toISOString());
  });

  it("noteSource reaches the tool's ledger and its parent, and does nothing outside a request", async () => {
    noteSource("forecast"); // no ledger: ignored
    const parent = new SourceLedger();
    const { value, sources } = await withSources(parent, async () => {
      await Promise.resolve();
      noteSource("weather-alerts", "2026-10-23T19:59:00Z");
      return 7;
    });
    expect(value).toBe(7);
    expect(sources.map((s) => s.id)).toEqual(["weather-alerts"]);
    expect(parent.list(NOW).map((s) => s.id)).toEqual(["weather-alerts"]);
  });
});

describe("feeds note their own timestamps", () => {
  it("MTA alerts use the GTFS-rt header time, not the fetch time", async () => {
    const ts = Math.floor(NOW / 1000) - 30;
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ header: { timestamp: ts }, entity: [] })));
    const { sources } = await withSources(undefined, () => serviceAlerts(["L"], ts));
    expect(sources[0]).toMatchObject({ id: "mta-alerts", asOf: new Date(ts * 1000).toISOString() });
  });

  it("restrooms use the dataset's last update from Socrata", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json([], { headers: { "X-SODA2-Truth-Last-Modified": "Fri, 27 Jun 2025 13:37:17 GMT" } })));
    const { sources } = await withSources(undefined, () => publicRestrooms());
    expect(sources[0]).toMatchObject({ id: "restrooms", asOf: "2025-06-27T13:37:17.000Z", stale: true });
  });
});

describe("the no-guessing check", () => {
  it("reads figures, not ordinals or digits inside line names", () => {
    expect(numbersIn("Take the Q53 to West 44th Street: 1,200 meters, leave at 9:41, 2.5 km")).toEqual([1200, 9, 41, 2.5]);
  });

  it("flags figures the user did not say", () => {
    expect(inventedNumbers("There were 312 noise complaints near 5th Avenue last month.", ["noise near 5th Avenue"])).toEqual(["312"]);
    expect(inventedNumbers("You can leave at 9 tomorrow.", ["can I leave at 9 tomorrow?"])).toEqual([]);
    expect(inventedNumbers("I don't have data on that.", [])).toEqual([]);
  });
});
