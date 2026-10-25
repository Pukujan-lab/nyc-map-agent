import { describe, expect, it } from "vitest";
import { coverInsets } from "./mapCover";

const phone = { left: 0, top: 0, right: 390, bottom: 844 };
const desktop = { left: 0, top: 0, right: 1440, bottom: 900 };

describe("coverInsets", () => {
  it("pads the top on a phone when a panel spans the top", () => {
    expect(coverInsets(phone, [{ left: 16, top: 16, right: 374, bottom: 300 }])).toEqual({ top: 312, bottom: 0, left: 0, right: 0 });
  });

  it("pads the bottom for a sheet across the bottom", () => {
    expect(coverInsets(phone, [{ left: 12, top: 560, right: 378, bottom: 740 }])).toEqual({ top: 0, bottom: 296, left: 0, right: 0 });
  });

  it("pads the side a desktop panel is docked to", () => {
    expect(coverInsets(desktop, [{ left: 12, top: 76, right: 392, bottom: 400 }])).toEqual({ top: 0, bottom: 0, left: 404, right: 0 });
    expect(coverInsets(desktop, [{ left: 1024, top: 16, right: 1424, bottom: 500 }])).toEqual({ top: 0, bottom: 0, left: 0, right: 428 });
  });

  it("always leaves a clear strip for the focus, and ignores hidden covers", () => {
    // 844 tall: a quarter (211 px) stays clear.
    expect(coverInsets(phone, [{ left: 0, top: 0, right: 390, bottom: 800 }]).top).toBe(633);
    // A small phone with a panel on top and an answer at the bottom: both shrink, 160 px stays clear.
    const se = { left: 0, top: 0, right: 375, bottom: 667 };
    const both = coverInsets(se, [{ left: 16, top: 16, right: 359, bottom: 360 }, { left: 0, top: 380, right: 375, bottom: 667 }]);
    expect(667 - both.top - both.bottom).toBeGreaterThanOrEqual(166);
    expect(coverInsets(phone, [{ left: 0, top: 0, right: 0, bottom: 0 }])).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});
