import { describe, expect, it } from "vitest";
import { PALE_MAJOR, PALE_STREET, readableChange } from "./readable";

const t = "transportation";
describe("readable transit basemap", () => {
  it("hides street casings and pales the streets", () => {
    expect(readableChange({ id: "road_minor_casing", type: "line", "source-layer": t })).toEqual({ visibility: "none" });
    expect(readableChange({ id: "road_minor", type: "line", "source-layer": t })).toEqual({ color: PALE_STREET });
    expect(readableChange({ id: "road_trunk_primary", type: "line", "source-layer": t })).toEqual({ color: PALE_MAJOR });
  });
  it("leaves rail lines and unrelated layers alone", () => {
    expect(readableChange({ id: "road_transit_rail", type: "line", "source-layer": t })).toBeNull();
    expect(readableChange({ id: "water", type: "fill" })).toBeNull();
  });
  it("drops minor names and arrows but keeps major names faint", () => {
    expect(readableChange({ id: "highway-name-minor", type: "symbol" })).toEqual({ visibility: "none" });
    expect(readableChange({ id: "road_one_way_arrow", type: "symbol" })).toEqual({ visibility: "none" });
    expect(readableChange({ id: "highway-name-major", type: "symbol" })?.textColor).toBeTruthy();
  });
});
