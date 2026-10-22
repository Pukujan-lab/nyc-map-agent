import { describe, expect, it } from "vitest";
import { CHOICES, DAY, NIGHT, THEMES, autoPalette, mixHex, readTheme, themeTarget } from "./theme";

describe("themes", () => {
  it("default to Auto and drop unknown names", () => {
    expect(readTheme({ getItem: () => null })).toBe("auto");
    expect(readTheme({ getItem: () => "neon-old" })).toBe("auto");
    expect(readTheme({ getItem: () => "ivory" })).toBe("ivory");
    expect(CHOICES).toEqual(["auto", "ivory", "ink", "mta", "neon"]);
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
  it("mixes colours", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#112233", "#445566", 0)).toBe("#112233");
  });
  it("Auto follows the sun in NYC (Oct 21 2026: sunset ~18:10 EDT)", () => {
    expect(autoPalette(new Date("2026-10-21T12:00:00-04:00")).phase).toBe("day");
    expect(autoPalette(new Date("2026-10-21T12:00:00-04:00")).palette).toEqual(DAY);
    const dusk = autoPalette(new Date("2026-10-21T18:05:00-04:00"));
    expect(dusk.phase).toBe("dusk");
    expect(dusk.ui).toBe("dusk");
    expect(autoPalette(new Date("2026-10-21T23:00:00-04:00")).palette).toEqual(NIGHT);
    expect(autoPalette(new Date("2026-10-22T07:05:00-04:00")).phase).toBe("dawn");
    // Reduced motion steps instead of fading.
    expect([DAY.land, "#EDE3D6"]).toContain(autoPalette(new Date("2026-10-21T17:50:00-04:00"), undefined, true).palette.land);
  });
});
