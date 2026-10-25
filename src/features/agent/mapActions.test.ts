import { describe, expect, it, vi } from "vitest";
import { CRASH_COLOR, distanceText, runMapAction, SKIP_COLOR, TROUBLE_COLOR, type MapActionContext } from "./mapActions";
import { streamEvent } from "./schema";
import { pointsToGeoJson, routeColor } from "./tripLayer";

const ctx = (): MapActionContext => ({ flyTo: vi.fn(), showTrip: vi.fn(), showRestroom: vi.fn(), showPoints: vi.fn(), remind: vi.fn(), showLayer: vi.fn(), showLine: vi.fn() });
const stops = [{ at: [-73.91, 40.74] as [number, number], name: "52 St" }];

describe("answer map actions", () => {
  it("fly-to moves the camera", () => {
    const c = ctx();
    expect(runMapAction({ kind: "flyTo", id: "f", label: "Show Grand Central", lon: -73.977, lat: 40.752, zoom: 16 }, c, routeColor)).toEqual({ ok: true, kind: "flyTo" });
    expect(c.flyTo).toHaveBeenCalledWith(-73.977, 40.752, 16);
  });

  it("a line button opens that line", () => {
    const c = ctx();
    expect(runMapAction({ kind: "showLine", id: "line:7", label: "See the 7 trains live", route: "7" }, c, routeColor)).toEqual({ ok: true, kind: "showLine" });
    expect(c.showLine).toHaveBeenCalledWith("7");
  });

  it("a restroom opens with its card details", () => {
    const c = ctx();
    runMapAction({ kind: "showRestroom", id: "r", label: "Show the nearest restroom", restroom: { name: "Union Square Park", lon: -73.99, lat: 40.736, distanceM: 120, hours: "8am-8pm" } }, c, routeColor);
    expect(c.showRestroom).toHaveBeenCalledWith(expect.objectContaining({ name: "Union Square Park", hours: "8am-8pm", status: null }));
  });

  it("skipped stops draw in the trouble colour, a line's stops in its own colour", () => {
    const c = ctx();
    runMapAction({ kind: "showStops", id: "s", label: "Show the stops the 7 skips", route: "7", skipped: true, stops }, c, routeColor);
    runMapAction({ kind: "showStops", id: "t", label: "Show 7 stops", route: "7", stops }, c, routeColor);
    runMapAction({ kind: "showStops", id: "u", label: "Show Q53 stops", route: "Q53", color: "#00AEEF", stops }, c, routeColor);
    const colors = vi.mocked(c.showPoints).mock.calls.map(([, s]) => s.color);
    expect(colors).toEqual([SKIP_COLOR, "#B933AD", "#00AEEF"]);
  });

  it("crash hotspots draw as points", () => {
    const c = ctx();
    runMapAction({ kind: "showCrashes", id: "c", label: "Show crashes on this route", points: stops }, c, routeColor);
    expect(c.showPoints).toHaveBeenCalledWith(stops, { color: CRASH_COLOR, title: "Show crashes on this route" });
  });

  it("MTA trouble draws each kind in its own colour (#361)", () => {
    const c = ctx();
    const shuttle = [{ at: [-73.94905, 40.69457] as [number, number], name: "Shuttle bus: Nostrand Av at Myrtle Av (to Bedford-Nostrand Avs)" }];
    for (const style of ["problem", "shuttle", "switch", "stuck"] as const) {
      expect(runMapAction({ kind: "showTrouble", id: style, label: `Show ${style}`, route: "G", style, points: shuttle }, c, routeColor)).toEqual({ ok: true, kind: "showTrouble" });
    }
    expect(vi.mocked(c.showPoints).mock.calls.map(([, s]) => s.color)).toEqual([TROUBLE_COLOR.problem, TROUBLE_COLOR.shuttle, TROUBLE_COLOR.switch, TROUBLE_COLOR.stuck]);
    expect(runMapAction({ kind: "showTrouble", id: "x", label: "x", route: "G", style: "detour", points: shuttle }, c, routeColor).ok).toBe(false);
  });

  it("rejects an invalid action without throwing", () => {
    const c = ctx();
    expect(runMapAction({ kind: "showStops", id: "x", label: "x", route: "7", stops: [] }, c, routeColor).ok).toBe(false);
    expect(runMapAction({ kind: "teleport" }, c, routeColor).ok).toBe(false);
    c.flyTo = () => { throw new Error("no map"); };
    expect(runMapAction({ kind: "flyTo", id: "f", label: "x", lon: 0, lat: 0 }, c, routeColor)).toEqual({ ok: false, error: "no map" });
  });

  it("the stream accepts an actions line", () => {
    expect(streamEvent.safeParse({ type: "actions", actions: [{ kind: "flyTo", id: "f", label: "Show it", lon: -74, lat: 40.7 }] }).success).toBe(true);
  });

  it("points become labelled GeoJSON, distances read plainly", () => {
    expect(pointsToGeoJson(stops, "#123456").features[0]).toEqual({ type: "Feature", properties: { name: "52 St", color: "#123456" }, geometry: { type: "Point", coordinates: [-73.91, 40.74] } });
    expect(distanceText(123)).toBe("120 m");
    expect(distanceText(1530)).toBe("1.5 km");
    expect(routeColor("6X")).toBe("#00933C");
  });
});

describe("showLayer (#313)", () => {
  it("turns on the named layer and nothing else", () => {
    const c = ctx();
    expect(runMapAction({ kind: "showLayer", id: "layer:health", label: "Turn on clinics and pharmacies", layer: "health" }, c, () => "#000")).toEqual({ ok: true, kind: "showLayer" });
    expect(c.showLayer).toHaveBeenCalledWith("health");
    expect(runMapAction({ kind: "showLayer", id: "layer:x", label: "x", layer: "everything" }, c, () => "#000").ok).toBe(false);
  });
});
