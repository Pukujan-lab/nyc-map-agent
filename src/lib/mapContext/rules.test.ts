import { describe, expect, it } from "vitest";
import { contextKey, pickContext, type ContextInputs, type MapContext } from "./context";
import { classifyLayer, focusMatch, focusRoutes, treatmentFor } from "./rules";

const base: ContextInputs = { followedKey: null, followedRoute: null, walking: false, panelId: null, chatOpen: false };
const subwayF: MapContext = { kind: "following", system: "subway", route: "F" };
const busM15: MapContext = { kind: "following", system: "bus", route: "M15" };

describe("pickContext", () => {
  it("is browsing by default", () => expect(pickContext(base)).toEqual({ kind: "browsing" }));
  it("reads the system off the follow key", () => {
    expect(pickContext({ ...base, followedKey: "subway:1_F..N", followedRoute: "F" })).toEqual(subwayF);
    expect(pickContext({ ...base, followedKey: "bus:7421", followedRoute: "M15" })).toEqual(busM15);
    expect(pickContext({ ...base, followedKey: "lirr:9", followedRoute: null })).toMatchObject({ system: "rail", route: null });
  });
  it("prefers follow over trip over walking over place over agent", () => {
    const all = { followedKey: "bus:1", followedRoute: "M15", walking: true, panelId: "agent:trip:1", chatOpen: true };
    expect(pickContext(all).kind).toBe("following");
    expect(pickContext({ ...all, followedKey: null }).kind).toBe("trip");
    expect(pickContext({ ...all, followedKey: null, panelId: "restroom:Bryant Park" }).kind).toBe("walking");
    expect(pickContext({ ...base, panelId: "restroom:Bryant Park", chatOpen: true }).kind).toBe("place");
    expect(pickContext({ ...base, panelId: "place-toilet:42" }).kind).toBe("place");
    expect(pickContext({ ...base, panelId: "transit:station:subway:A57" }).kind).toBe("browsing");
    expect(pickContext({ ...base, chatOpen: true }).kind).toBe("agent");
  });
  it("keys a follow by its route, so a new line re-arms the clean map", () => {
    expect(contextKey(subwayF)).not.toBe(contextKey({ ...subwayF, route: "A" }));
  });
});

describe("classifyLayer", () => {
  it.each([
    ["landmark-labels", "landmarks"], ["landmark-pins", "landmarks"],
    ["transit-line", "subwayLines"], ["transit-line-under", "subwayLines"],
    ["transit-station-label", "stations"], ["transit-bullet", "trains"],
    ["transit-bus-badge-full", "buses"], ["transit-bus-route-line", "busRoute"],
    ["transit-focus-veil", "basemap"], ["poi_r20", "businesses"], ["poi_transit", "stations"],
    ["events-pin", "events"], ["parking-icons", "parking"], ["restrooms", "restrooms"], ["place-toilets", "restrooms"],
    ["block-heat", "data"], ["borough-outline", "data"], ["traffic-speeds", "data"],
    ["road_minor", "roads"], ["bridge_street_casing", "roads"], ["road_one_way_arrow", "basemap"],
    ["highway-name-minor", "basemap"], ["water", "basemap"], ["building", "basemap"],
  ])("%s → %s", (id, group) => expect(classifyLayer(id)).toBe(group));
});

describe("rule table", () => {
  it("following a subway train keeps its line, stations, train and landmarks; hides the rest; dims roads", () => {
    const t = (id: string) => treatmentFor(id, subwayF);
    expect([t("transit-line"), t("transit-station"), t("transit-bullet")]).toEqual(["focus", "focus", "focus"]);
    expect(t("landmark-labels")).toBe("keep");
    for (const id of ["transit-bus-badge", "poi_r20", "events-pin", "parking-icons", "block-heat", "restrooms", "ferry-lines"]) expect(t(id)).toBe("hide");
    expect(t("road_minor")).toBe("dim");
    expect(t("water")).toBe("keep");
  });
  it("following a bus keeps its buses and route; hides subway", () => {
    const t = (id: string) => treatmentFor(id, busM15);
    expect(t("transit-bus-badge")).toBe("focus");
    expect(t("transit-bus-route-line")).toBe("keep");
    expect(t("transit-line")).toBe("hide");
    expect(t("transit-bullet")).toBe("hide");
  });
  it("walking keeps restrooms (if on), stations, streets and landmarks; hides moving transit", () => {
    const w: MapContext = { kind: "walking" };
    expect(["restrooms", "transit-station", "road_minor", "landmark-labels", "highway-name-minor"].map((id) => treatmentFor(id, w))).toEqual(["keep", "keep", "keep", "keep", "keep"]);
    expect(["transit-line", "transit-bullet", "transit-bus-badge", "block-heat"].map((id) => treatmentFor(id, w))).toEqual(["hide", "hide", "hide", "hide"]);
  });
  it("browsing changes nothing", () => {
    for (const id of ["transit-line", "poi_r20", "road_minor", "events-pin"]) expect(treatmentFor(id, { kind: "browsing" })).toBe("keep");
  });
  it("landmarks are kept in every context", () => {
    const all: MapContext[] = [subwayF, busM15, { kind: "trip" }, { kind: "walking" }, { kind: "place" }, { kind: "agent" }, { kind: "following", system: "subway", route: null }];
    for (const c of all) expect(treatmentFor("landmark-anything", c)).toBe("keep");
  });
});

describe("focusMatch", () => {
  it("matches stations by a whole route token", () => {
    expect(JSON.stringify(focusMatch("transit-station", ["F"]))).toContain('" F "');
  });
  it("has no match for layers without a route", () => {
    expect(focusMatch("transit-entrance", ["F"])).toBeNull();
  });
  it("treats an express as its local line too", () => {
    expect(focusRoutes("6X")).toEqual(["6X", "6"]);
    expect(focusRoutes("F")).toEqual(["F"]);
  });
});
