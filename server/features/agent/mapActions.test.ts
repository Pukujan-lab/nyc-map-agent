import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";
import { streamEvent, trip as tripSchema, type MapAction, type StreamEvent } from "../../../src/features/agent/schema";
import type { ServiceChange } from "../../../src/lib/transit/serviceChanges";
import { ActionCollector, placeActions, placeName, restroomActions, tripActions } from "./mapActions";
import { POST } from "./routes";
import { nearestRestrooms, type RestroomRow } from "./services";
import { skippedStops } from "./trip";
import type { Station } from "./transit";

const transitTrip = tripSchema.parse({
  id: "t1",
  origin: { label: "Union Sq", at: [-73.9903, 40.7359] },
  destination: { label: "Flushing", at: [-73.83, 40.7596] },
  departIso: "2026-10-23T09:00",
  arriveIso: "2026-10-23T09:50",
  routes: ["7"],
  skips: [{ route: "7", name: "52 St", at: [-73.9128, 40.7441], toward: "Flushing" }, { route: "7", name: "69 St", at: [-73.8964, 40.7464], toward: "Flushing" }],
  legs: [
    { kind: "ride", route: "7", label: "7 train", fromStop: "Times Sq-42 St", toStop: "Flushing-Main St", color: "#B933AD", coords: [[-73.9875, 40.7553], [-73.83, 40.7596]], durationS: 2400, underground: false, geometrySource: "gtfs-shape", stops: [{ at: [-73.9, 40.74], text: "61 St-Woodside" }] },
  ],
});

const driveTrip = tripSchema.parse({
  id: "d1",
  mode: "drive",
  origin: { label: "Union Sq", at: [-73.9903, 40.7359] },
  destination: { label: "JFK", at: [-73.7781, 40.6413] },
  departIso: "2026-10-23T07:30",
  arriveIso: "2026-10-23T08:20",
  routes: [],
  context: [
    { kind: "crashes", text: "Crash hotspot: 34 crashes in 12 months", at: [-73.9, 40.68] },
    { kind: "slow", text: "Slow on the BQE" },
    { kind: "crashes", text: "Crash hotspot without a spot" },
  ],
  legs: [{ kind: "drive", label: "Drive to JFK", coords: [[-73.9903, 40.7359], [-73.7781, 40.6413]], durationS: 3000, distanceM: 25000 }],
});

const row = (name: string, lon: number, lat: number, status = "Operational"): RestroomRow => ({ facility_name: name, longitude: String(lon), latitude: String(lat), status, hours_of_operation: "8am-8pm", accessibility: "Fully Accessible" });

describe("map actions from tool results", () => {
  it("a transit trip offers the route, the stops its line skips, then the line's stops", () => {
    const a = tripActions(transitTrip);
    expect(a.map((x) => x.kind)).toEqual(["showRoute", "showStops", "showStops"]);
    const [, skipped, stops] = a as Array<Extract<MapAction, { kind: "showStops" }>>;
    expect(skipped).toMatchObject({ label: "Show the stops the 7 skips", skipped: true, route: "7" });
    expect(skipped.stops.map((s) => s.name)).toEqual(["52 St (Flushing-bound)", "69 St (Flushing-bound)"]);
    expect(stops.label).toBe("Show 7 stops");
    expect(stops.stops.map((s) => s.name)).toEqual(["Times Sq-42 St", "61 St-Woodside", "Flushing-Main St"]);
  });

  it("a drive offers its crash hotspots, only those with a spot on the map", () => {
    const a = tripActions(driveTrip);
    expect(a.map((x) => x.label)).toEqual(["Show the drive", "Show crashes on this route"]);
    const crashes = a[1] as Extract<MapAction, { kind: "showCrashes" }>;
    expect(crashes.points).toEqual([{ at: [-73.9, 40.68], name: "Crash hotspot: 34 crashes in 12 months" }]);
  });

  it("a trip with no skips, rides or crashes offers only the route", () => {
    const walk = tripSchema.parse({ ...driveTrip, id: "w1", mode: "walk", context: [] });
    expect(tripActions(walk).map((x) => x.label)).toEqual(["Show the walk"]);
  });

  it("the nearest open restroom comes first and carries its card details", () => {
    const here: [number, number] = [-73.99, 40.735];
    const spots = nearestRestrooms([row("Far Park", -73.95, 40.78), row("Closed Kiosk", -73.9901, 40.7351, "Not Operational"), row("Union Square Park", -73.9905, 40.7362)], here, 3, new Date("2026-10-25T12:00:00-04:00"));
    expect(spots.map((s) => s.name)).toEqual(["Union Square Park", "Far Park"]);
    const [first, second] = restroomActions(spots);
    expect(first).toMatchObject({ kind: "showRestroom", label: "Show the nearest restroom", restroom: { name: "Union Square Park", hours: "8am-8pm", accessibility: "Fully Accessible" } });
    expect(second.label).toBe("Show the next closest restroom");
  });

  it("skips a restroom that is closed right now by its listed hours (#419: 8am-4pm at 1:36 am)", () => {
    const night = new Date("2026-10-25T01:36:00-04:00");
    const playground = { ...row("Moore Homestead Playground", -73.8803, 40.7365), hours_of_operation: "8am-4pm, Open later seasonally" };
    const allNight = { ...row("Elmhurst Hospital", -73.8857, 40.7448), hours_of_operation: "24 Hours" };
    const spots = nearestRestrooms([playground, allNight], [-73.8806, 40.7366], 3, night);
    expect(spots.map((s) => [s.name, s.openNow])).toEqual([["Elmhurst Hospital", true]]);
  });

  it("falls back to closed restrooms when nothing open is within 1.5 km", () => {
    const spots = nearestRestrooms([row("Closed Kiosk", -73.9901, 40.7351, "Not Operational"), row("Bronx Park", -73.87, 40.85)], [-73.99, 40.735]);
    expect(spots[0].name).toBe("Closed Kiosk");
  });

  it("a looked-up place gets a fly-to button, the user's own spot does not", () => {
    expect(placeActions({ label: "Grand Central Terminal", at: [-73.9772, 40.7527] })).toEqual([{ kind: "flyTo", id: "fly:-73.97720,40.75270", label: "Show Grand Central Terminal", lon: -73.9772, lat: 40.7527, zoom: 16 }]);
    expect(placeActions({ label: "your location", at: [-73.99, 40.73] })).toEqual([]);
  });

  it("the collector dedupes by id, ranks trouble first, and caps the list", () => {
    const c = new ActionCollector();
    c.add(placeActions({ label: "Grand Central", at: [-73.9772, 40.7527] }));
    c.add(tripActions(transitTrip));
    c.add(tripActions(transitTrip));
    c.add(restroomActions(nearestRestrooms([row("A", -73.99, 40.73), row("B", -73.98, 40.73)], [-73.99, 40.73])));
    c.add([{ kind: "flyTo", id: "bad", label: "x", lon: 999, lat: 0 }]);
    const list = c.list();
    expect(list.map((a) => a.kind)).toEqual(["showRestroom", "showRestroom", "showRoute", "showStops", "showStops", "flyTo"]);
    expect((list[3] as Extract<MapAction, { kind: "showStops" }>).skipped).toBe(true);
    expect(list.some((a) => a.id === "bad")).toBe(false);
  });
});

describe("skipped stops on a trip", () => {
  const stations: Station[] = [
    { id: "718", complexId: "718", name: "52 St", routes: ["7"], structure: "Elevated", at: [-73.9128, 40.7441] },
    { id: "R1", complexId: "R1", name: "52 St", routes: ["R"], structure: "Subway", at: [-73.0, 40.0] },
  ];
  const changes: ServiceChange[] = [
    { alertId: "a", route: "7", kind: "skip", names: ["52 St", "Nowhere Av"], toward: "Flushing", notice: "" },
    { alertId: "b", route: "F", kind: "skip", names: ["52 St"], toward: null, notice: "" },
    { alertId: "c", route: "7", kind: "platform", names: ["52 St"], toward: null, notice: "" },
  ];
  it("places a skip on the station of that line and drops names it cannot place", () => {
    expect(skippedStops(changes, stations, ["7X"])).toEqual([{ route: "7", name: "52 St", at: [-73.9128, 40.7441], toward: "Flushing" }]);
    expect(skippedStops(changes, stations, ["4"])).toEqual([]);
  });
});

describe("POST /api/agent streams the actions line (mocked LLM)", () => {
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
  const finish = (reason: "tool-calls" | "stop") => ({ type: "finish", finishReason: { unified: reason, raw: reason }, usage }) as const;
  const model = (toolName: string, input: unknown) => {
    let step = 0;
    return new MockLanguageModelV4({
      doStream: () => {
        step += 1;
        const chunks = step === 1
          ? [{ type: "tool-call", toolCallId: "c1", toolName, input: JSON.stringify(input) }, finish("tool-calls")]
          : [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "The closest is Union Square Park." }, { type: "text-end", id: "t" }, finish("stop")];
        return Promise.resolve({ stream: convertArrayToReadableStream(chunks as never[]) });
      },
    });
  };
  const walk = () => Promise.resolve({ coords: [[-73.99, 40.735], [-73.9905, 40.7362]] as [number, number][], distanceM: 140, durationS: 120, turns: [{ at: [-73.99, 40.735] as [number, number], text: "Turn left onto East 14th Street" }] });
  const run = async (toolName: string, input: unknown, m?: ReturnType<typeof model>): Promise<StreamEvent[]> => {
    const req = new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "nearest restroom" }], location: { lon: -73.99, lat: 40.735 } }) });
    const res = await POST(req, { model: m ?? model(toolName, input), deps: { restrooms: () => Promise.resolve([row("Union Square Park", -73.9905, 40.7362)]), walk } });
    return (await res.text()).trim().split("\n").map((l) => streamEvent.parse(JSON.parse(l)));
  };

  it("nearest_restroom gives the model the walk to the nearest one, so the answer can give directions", async () => {
    const m = model("nearest_restroom", { place: "here" });
    await run("nearest_restroom", { place: "here" }, m);
    const second = JSON.stringify(m.doStreamCalls[1]?.prompt);
    expect(second).toContain("walkToNearest");
    expect(second).toContain("Turn left onto East 14th Street");
  });

  it("nearest_restroom yields one actions line, before done, with the restroom", async () => {
    const events = await run("nearest_restroom", { place: "here" });
    const i = events.findIndex((e) => e.type === "actions");
    expect(i).toBeGreaterThan(-1);
    expect(events.findIndex((e) => e.type === "done")).toBeGreaterThan(i);
    const ev = events[i] as Extract<StreamEvent, { type: "actions" }>;
    expect(ev.actions).toHaveLength(1);
    expect(ev.actions[0]).toMatchObject({ kind: "showRestroom", restroom: { name: "Union Square Park" } });
  });

  it("a tool with nothing to show sends no actions line", async () => {
    const events = await run("enterStreetView", { place: "here" });
    expect(events.some((e) => e.type === "actions")).toBe(false);
  });
});

describe("buttons only for places the answer stands behind", () => {
  it("drops a geocoder leftover the answer calls unrelated, keeps named places", async () => {
    const { answerNames, ActionCollector } = await import("./mapActions");
    const answer = "I don't have an events listing, so I can't find the 3 Percent Club event — the only map match was an unrelated Staten Island address.";
    expect(answerNames(answer, "Show 3 YACHT CLUB CV, Staten Island, NY")).toBe(false);
    expect(answerNames("The Empire State Building is a 6-minute walk.", "Show Empire State Building, Manhattan")).toBe(true);
    expect(answerNames("Bryant Park has the closest restroom.", "Show Bryant Park")).toBe(true);
    const c = new ActionCollector();
    c.add([{ kind: "flyTo", id: "fly:1", label: "Show 3 YACHT CLUB CV, Staten Island, NY", lon: -74.1, lat: 40.5, zoom: 16 }]);
    expect(c.list(answer)).toEqual([]);
    expect(c.list()).toHaveLength(1);
  });
  it("names a pinned place without its address", () => {
    expect(placeName("Bryant Park, Manhattan Community Board 5, New York, NY")).toBe("Bryant Park");
    expect(placeName("120, Park Avenue, New York")).toBe("120 Park Avenue");
    expect(placeActions({ label: "Bryant Park, Manhattan, New York", at: [-73.98, 40.75] })[0].label).toBe("Show Bryant Park");
  });
});
