import { describe, expect, it } from "vitest";
import { isBasemapPoiLayer } from "@/lib/map/basemapStations";
import { stationBulletsId, stationLabelColors, stationLabels } from "./stationLabels";

const st = (id: string, name: string, routes: string, lon: number, lat: number) =>
  ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [lon, lat] }, properties: { id, name, routes } });

describe("station labels", () => {
  it("merges one complex's platforms into one major label with every route", () => {
    const fc = stationLabels([
      st("235", "Atlantic Av-Barclays Ctr", "2 3 4 5", -73.9777, 40.6843),
      st("D24", "Atlantic Av-Barclays Ctr", "B Q", -73.9774, 40.6840),
      st("R31", "Atlantic Av-Barclays Ctr", "D N R W", -73.9786, 40.6836),
      st("L24", "Atlantic Av", "L", -73.903, 40.675),
    ], { B: "#FF6319" });
    expect(fc.features).toHaveLength(2);
    const a = fc.features[0].properties;
    expect(a.routes).toBe("2 3 4 5 B D N Q R W");
    expect(a.major).toBe(true);
    expect(a.bullets).toContain("B:FF6319");
    expect(fc.features[1].properties.major).toBe(false);
  });
  it("keeps same-named stations far apart separate", () => {
    expect(stationLabels([st("a", "86 St", "1", -73.976, 40.788), st("b", "86 St", "4 5 6", -73.955, 40.779)]).features).toHaveLength(2);
  });
  it("encodes bullet strips with a grey fallback", () => {
    expect(stationBulletsId(["7"], {})).toBe("stnbullets|7:808183");
  });
  it("uses dark ink on light themes and light ink on dark ones, haloed in the land colour", () => {
    expect(stationLabelColors("ivory")).toEqual({ ink: "#141414", halo: "#F2F1ED" });
    expect(stationLabelColors("ink").ink).toBe("#F7F6F2");
    expect(stationLabelColors("neon").halo).toBe("#0B0919");
  });
  it("touches only the basemap transit poi layer, not Places' ranked ones", () => {
    expect(isBasemapPoiLayer({ id: "poi_transit", type: "symbol", "source-layer": "poi" })).toBe(true);
    expect(isBasemapPoiLayer({ id: "poi_r1", type: "symbol", "source-layer": "poi" })).toBe(false);
  });
});
