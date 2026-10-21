import { describe, expect, it } from "vitest";
import { THEMES, readTheme, themeTarget } from "./theme";

describe("themes", () => {
  it("default to Ivory and drop unknown names", () => {
    expect(readTheme({ getItem: () => null })).toBe("ivory");
    expect(readTheme({ getItem: () => "neon-old" })).toBe("ivory");
    expect(readTheme({ getItem: () => "ink" })).toBe("ink");
    expect(readTheme({ getItem: () => "neon" })).toBe("neon");
    expect(Object.keys(THEMES)).toEqual(["ivory", "ink", "mta", "neon"]);
  });
  it("repaints only land, water and parks", () => {
    expect(themeTarget({ id: "background", type: "background" })).toEqual({ prop: "background-color", key: "land" });
    expect(themeTarget({ id: "water", type: "fill", "source-layer": "water" })?.key).toBe("water");
    expect(themeTarget({ id: "park", type: "fill", "source-layer": "park" })?.key).toBe("park");
    expect(themeTarget({ id: "road_minor", type: "line", "source-layer": "transportation" })).toBeNull();
  });
});
