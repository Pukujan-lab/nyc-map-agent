import { describe, expect, it } from "vitest";
import { isBasemapPoiLayer } from "@/lib/map/basemapStations";
import { DUSK, NIGHT, THEMES } from "@/lib/theme";
import { stationComplexes, stationLabelInk } from "./stationLabels";

const st = (id: string, name: string, routes: string, lon: number, lat: number) => ({ geometry: { coordinates: [lon, lat] }, properties: { id, name, routes } });

describe("station labels", () => {
  it("labels one complex once, with every route, as major", () => {
    const m = stationComplexes([
      st("235", "Atlantic Av-Barclays Ctr", "2 3 4 5", -73.9777, 40.6843),
      st("D24", "Atlantic Av-Barclays Ctr", "B Q", -73.9774, 40.684),
      st("R31", "Atlantic Av-Barclays Ctr", "D N R W", -73.9786, 40.6836),
      st("L24", "Atlantic Av", "L", -73.903, 40.675),
    ]);
    expect(m.get("235")).toEqual({ major: true, dup: false, routes: ["2", "3", "4", "5", "B", "D", "N", "Q", "R", "W"] });
    expect(m.get("D24")?.dup).toBe(true);
    expect(m.get("L24")).toEqual({ major: false, dup: false, routes: ["L"] });
  });
  it("keeps same-named stations far apart separate", () => {
    const m = stationComplexes([st("a", "86 St", "1", -73.976, 40.788), st("b", "86 St", "4 5 6", -73.955, 40.779)]);
    expect(m.get("b")?.dup).toBe(false);
  });
  it("uses dark ink on light palettes and light ink on dark ones, haloed in the land colour", () => {
    expect(stationLabelInk(THEMES.ivory)).toEqual({ ink: "#141414", halo: THEMES.ivory.land });
    expect(stationLabelInk(THEMES.ink).ink).toBe("#F7F6F2");
    expect(stationLabelInk(DUSK).ink).toBe("#141414");
    expect(stationLabelInk(NIGHT)).toEqual({ ink: "#F7F6F2", halo: NIGHT.land });
  });
  it("touches only the basemap transit poi layer, not Places' ranked ones", () => {
    expect(isBasemapPoiLayer({ id: "poi_transit", type: "symbol", "source-layer": "poi" })).toBe(true);
    expect(isBasemapPoiLayer({ id: "poi_r1", type: "symbol", "source-layer": "poi" })).toBe(false);
  });
});
